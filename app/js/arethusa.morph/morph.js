'use strict';
angular.module('arethusa.morph').service('morph', [
  'state',
  'configurator',
  'plugins',
  function (state, configurator, plugins) {
    var self = this;
    var morphRetrievers;
    var inventory;

    this.canSearch = true;

    // When a user is moving fast between chunks, a lot of outstanding
    // requests can build up in the retrievers. As they are all asynchronous
    // their callbacks fire when we have already moved away from the chunk which
    // started the calls.
    // This can lead to quite a bit of confusion and is generally not a very
    // good solution.
    // We therefore use the new abort() API of Resource to cancel all requests
    // we don't need anymore. All morph retrievers need to provide an abort()
    // function now (usually just a delegator to Resource.abort).
    //
    // On init, we check if morphRetrievers were already defined and if they
    // are we abort all outstanding requests.
    function abortOutstandingRequests() {
      if (morphRetrievers) {
        angular.forEach(morphRetrievers, abortRetriever);
      }
    }

    function abortRetriever(retriever) {
      retriever.abort();
    }


    this.defaultConf = {
      name: "morph",
      mappings: {},
      gloss: false,
      matchAll: true,
      preselect: false
    };

    function configure() {
      var props = [
        'postagSchema',
        'attributes',
        'mappings',
        'styledThrough',
        'noRetrieval',
        'gloss'
      ];

      configurator.getConfAndDelegate('morph', self, props);
      configurator.getStickyConf('morph', self, ['preselect', 'matchAll']);

      self.analyses = {};
      morphRetrievers = configurator.getRetrievers(self.conf.retrievers);
      propagateMappings(morphRetrievers);

      // This is useful for the creation of new forms. Usually we want to
      // validate if all attributes are set properly - the inclusion of
      // special empty attributes allows to say specifically that something
      // should be left unannotated/unknown. Useful for elliptic nodes etc.
      addSpecialEmptyAttributes();

      if (self.conf.lexicalInventory) {
        inventory = configurator.getRetriever(self.conf.lexicalInventory.retriever);
      }
    }

    configure();

    var emptyAttribute = {
      long: '---',
      short: '---',
      postag: '_'
    };

    function addSpecialEmptyAttribute(attrObj, name) {
      attrObj.values['---'] = emptyAttribute;
    }

    function addSpecialEmptyAttributes() {
      angular.forEach(self.attributes, addSpecialEmptyAttribute);
    }


    function propagateMapping(retriever, name) {
      retriever.mapping = self.mappings[name] || {};
    }

    function propagateMappings(retrievers) {
      angular.forEach(retrievers, propagateMapping);
    }

    function getDataFromInventory(form) {
      if (inventory) {
        var lexInv = form.lexInvLocation;
        if (lexInv) inventory.getData(lexInv.urn, form);
      }
    }

    function Forms(string) {
      this.string = string;
      this.forms  = [];
      this.analyzed = false;
    }

    function seedAnalyses() {
      return arethusaUtil.inject({}, state.tokens, function (obj, id, token) {
        obj[id] = new Forms(token.string);
      });
    }

    this.postagToAttributes = function (form) {
      var attrs = {};
      angular.forEach(form.postag, function (postagVal, i) {
        var postagClass = self.postagSchema[i];
        var possibleVals = self.attributeValues(postagClass);
        var attrObj = arethusaUtil.findObj(possibleVals, function (obj) {
            return obj.postag === postagVal;
          });
        // attrObj can be undefined when the postag is -
        if (attrObj) {
          attrs[postagClass] = attrObj.short;
        }
      });
      form.attributes = attrs;
    };

    function createEmptyPostag() {
      return arethusaUtil.map(self.postagSchema, function (el) {
        return '-';
      }).join('');
    }

    this.updatePostag = function (form, attr, val) {
      var index = self.postagSchema.indexOf(attr);
      var postag = self.postagValue(attr, val);
      form.postag = arethusaUtil.replaceAt(form.postag, index, postag);
    };

    this.attributesToPostag = function (attrs) {
      var postag = '';
      var postagArr = arethusaUtil.map(self.postagSchema, function (el) {
          var attrVals = self.attributeValues(el);
          var val = attrs[el];
          var valObj = arethusaUtil.findObj(attrVals, function (e) {
              return e.short === val;
            });
          return valObj ? valObj.postag : '-';
        });
      return postagArr.join('');
    };

    this.emptyForm = function(string) {
      return {
        lemma: string,
        postag: self.emptyPostag,
        attributes: emptyAttributes()
      };
    };

    function emptyAttributes() {
      return arethusaUtil.inject({}, self.postagSchema, function(memo, el) {
        memo[el] = undefined;
      });
    }

    // Gets a from the inital state - if we load an already annotated
    // template, we have to take it inside the morph plugin.
    // In the concrete use case of treebanking this would mean that
    // we have a postag value sitting there, which we have to expand.
    //
    // Once we have all information we need, the plugin also tries to
    // write back style information to the state object, e.g. to colorize
    // tokens according to their Part of Speech value.
    function getAnalysisFromState (val, id) {
      var analysis = state.tokens[id].morphology;
      // We could always have no analysis sitting in the data we are
      // looking at - no data also means that the postag is an empty
      // string or an empty postag.
      if (analysis && postagNotEmpty(analysis.postag)) {
        self.postagToAttributes(analysis);
        analysis.origin = 'document';
        analysis.selected = true;
        setGloss(id, analysis);
        val.forms.push(analysis);
        state.addStyle(id, self.styleOf(analysis));
      }
    }

    function postagNotEmpty(postag) {
      return postag && !postag.match(/^-*$/);
    }

    function mapAttributes(attrs) {
      // We could use inject on attrs directly, but this wouldn't give us
      // the correct order of properties inside the newly built object.
      // Let's iterate over the postag schema for to guarantee it.
      // Sorting of objects is a problem we need a solution for in other
      // places as well.
      // This solution comes at a price - if we cannot find a key (not every
      // form has a tense attribute for example), we might stuff lots of undefined
      // stuff into this object. We pass over this with a conditional.
      return arethusaUtil.inject({}, self.postagSchema, function (memo, k) {
        var v = attrs[k];
        if (v) {
          var values = self.attributeValues(k);
          var obj = arethusaUtil.findObj(values, function (el) {
              return el.short === v || el.long === v;
            });
          memo[k] = obj ? obj.short : v;
        }
      });
    }

    // When we find no form even after retrieving, we need to unset
    // the token style. This is important when we move from chunk
    // to chunk, as token might still have style from a former chunk.
    // When no analysis is present, this can be very misleading.
    function unsetStyleWithoutAnalyses(forms, id) {
      if (forms.length === 0) {
        state.unsetStyle(id);
      }
    }

    this.getExternalAnalyses = function (analysisObj, id) {
      angular.forEach(morphRetrievers, function (retriever, name) {
        retriever.getData(analysisObj.string, function (res) {
          res.forEach(function (el) {
            // need to parse the attributes now
            el.attributes = mapAttributes(el.attributes);
            // and build a postag
            el.postag = self.attributesToPostag(el.attributes);
            // try to obtain additional info from the inventory
            getDataFromInventory(el);
          });
          var forms = analysisObj.forms;
          mergeDuplicateForms(forms[0], res);
          arethusaUtil.pushAll(forms, res);

          if (self.preselect) {
            preselectForm(forms[0], id);
          }

          unsetStyleWithoutAnalyses(forms, id);
        });
      });
    };

    function mergeDuplicateForms(firstForm, otherForms) {
      if (firstForm && firstForm.origin === 'document') {
        var duplicate;
        for (var i = otherForms.length - 1; i >= 0; i--){
          var el = otherForms[i];
          if (isSameForm(firstForm, el)) {
            duplicate = el;
            break;
          }
        }
        if (duplicate) {
          angular.extend(firstForm, duplicate);
          firstForm.origin = 'document';
          otherForms.splice(otherForms.indexOf(duplicate), 1);
        }
      }
    }

    function isSameForm(a, b) {
      return a.lemma === b.lemma && a.postag === b.postag;
    }

    function selectedForm(id) {
      return state.getToken(id).morphology;
    }

    function preselectForm(form, id) {
      if (form && selectedForm(id) !== form) {
        state.doSilent(function() {
          self.setState(id, form);
        });
      }
    }

    function loadInitalAnalyses() {
      if (self.noRetrieval !== "all") {
        angular.forEach(self.analyses, loadToken);
      }
    }

    function loadToken(val, id) {
      getAnalysisFromState(val, id);
      if (self.noRetrieval !== "online") {
        self.getExternalAnalyses(val, id);
      } else {
        // We only need to do this when we don't
        // retrieve externally. If we do, we call
        // this function from within the request's
        // callback.
        unsetStyleWithoutAnalyses(val.forms, id);
      }
      val.analyzed = true;
      self.resetCustomForm(val, id);
    }

    self.preselectToggled = function() {
      if (self.preselect) applyPreselections();
    };

    this.hasSelection = function(analysis) {
      var hasSelection;
      for (var i = analysis.forms.length - 1; i >= 0; i--){
        if (analysis.forms[i].selected) {
          hasSelection = true;
          break;
        }
      }
      return hasSelection;
    };

    function applyPreselection(analysis, id) {
      if (analysis.forms.length > 0) {
        if (!self.hasSelection(analysis)) {
          self.setState(id, analysis.forms[0]);
        }
      }
    }

    function applyPreselections() {
      angular.forEach(self.analyses, applyPreselection);
    }

    self.resetCustomForm = function(val, id) {
      var string = state.asString(id);
      val.customForm = self.emptyForm(string);
    };

    this.currentAnalyses = function () {
      var analyses = self.analyses;
      return arethusaUtil.inject({}, state.selectedTokens, function (obj, id, val) {
        var token = analyses[id];
        if (token) {
          obj[id] = token;
        }
      });
    };

    this.selectAttribute = function (attr) {
      return self.attributes[attr] || {};
    };
    this.longAttributeName = function (attr) {
      return self.selectAttribute(attr).long;
    };
    this.attributeValues = function (attr) {
      return self.selectAttribute(attr).values || {};
    };
    this.attributeValueObj = function (attr, val) {
      return self.attributeValues(attr)[val] || {};
    };
    this.longAttributeValue = function (attr, val) {
      return self.attributeValueObj(attr, val).long;
    };
    this.abbrevAttributeValue = function (attr, val) {
      return self.attributeValueObj(attr, val).short;
    };
    this.postagValue = function (attr, val) {
      return self.attributeValueObj(attr, val).postag;
    };

    this.concatenatedAttributes = function (form) {
      var res = [];
      angular.forEach(form.attributes, function (value, key) {
        res.push(self.abbrevAttributeValue(key, value));
      });
      return res.join('.');
    };

    this.sortAttributes = function(attrs) {
      return arethusaUtil.inject([], self.postagSchema, function(memo, p) {
        var val = attrs[p];
        if (val) {
          memo.push({
            attr: p,
            val: val
          });
        }
      });
    };

    this.styleOf = function (form) {
      var styler = self.styledThrough;
      var styleVal = form.attributes[styler];
      return self.attributeValueObj(styler, styleVal).style;
    };

    this.removeForm = function(id, form) {
      var forms = self.analyses[id].forms;
      var i = forms.indexOf(form);
      forms.splice(i, 1);
    };

    function deselectAll(id) {
      angular.forEach(self.analyses[id].forms, function(form, i) {
        form.selected = false;
      });
    }

    function undoFn(id) {
      var current = selectedForm(id);
      if (current) {
        return function() { self.setState(id, current); };
      } else
        return function() { self.unsetState(id); };
    }

    function preExecFn(id, form) {
      return function() {
        deleteFromIndex(id);
        addToIndex(form, id);
        deselectAll(id);
        form.selected = true;
        state.addStyle(id, self.styleOf(form));
      };
    }

    function setGloss(id, form) {
      if (self.gloss) self.analyses[id].gloss = form.gloss;
    }

    this.updateGloss = function(id, form) {
      if (self.gloss) {
        var gloss = self.analyses[id].gloss;
        if (gloss) {
          form = form || selectedForm(id);
          form.gloss = gloss;
        }
      }
    };

    this.setState = function (id, form) {
      setGloss(id, form);
      state.change(id, 'morphology', form, undoFn(id), preExecFn(id, form));
    };

    this.unsetState = function (id) {
      deleteFromIndex(id);
      deselectAll(id);
      state.unsetStyle(id);
      state.unsetState(id, 'morphology');
    };

    this.rulesOf = function (attr) {
      return self.selectAttribute(attr).rules;
    };

    function findThroughOr(keywords) {
      return arethusaUtil.inject({}, keywords, function(memo, keyword) {
        var hits = searchIndex[keyword] || [];
        angular.forEach(hits, function(id, i) {
          memo[id] = true;
        });
      });
    }

    function findThroughAll(keywords) {
      // we need to fill a first array which we can check against first
      var firstKw = keywords.shift();
      var hits = searchIndex[firstKw] || [];
      angular.forEach(keywords, function(keyword, i) {
        var moreHits = searchIndex[keyword] || [];
        hits = arethusaUtil.intersect(hits, moreHits);
      });
      // and know return something with unique values
      return arethusaUtil.inject({}, hits, function(memo, id) {
        memo[id] = true;
      });
    }

    this.queryForm = function() {
      var keywords = self.formQuery.split(' ');
      // The private fns return an object and not an array, even if we only
      // need ids - but we avoid duplicate keys that way.
      var ids = self.matchAll ? findThroughAll(keywords) : findThroughOr(keywords);
      state.multiSelect(Object.keys(ids));
    };

    var searchIndex;
    function createSearchIndex() {
      searchIndex = {};
      angular.forEach(state.tokens, function(token, id) {
        var form = token.morphology || {};
        addToIndex(form, id);
      });
    }

    function addToIndex(form, id) {
      var attrs = form.attributes || {};
      angular.forEach(attrs, function(val, key) {
        if (!searchIndex[val]) {
          searchIndex[val] = [];
        }
        searchIndex[val].push(id);
      });
    }

    function deleteFromIndex(id) {
      var form = state.getToken(id).morphology || {};
      var attrs = form.attributes || {};
      angular.forEach(attrs, function(value, key) {
        // the index might contain duplicate ids
        var ids = searchIndex[value];
        var i = ids.indexOf(id);
        while (i !== -1) {
          ids.splice(i, 1);
          i = ids.indexOf(id);
        }
      });
    }

    this.canEdit = function() {
      return self.mode === "editor";
    };

    state.on('tokenAdded', function(event, token) {
      var id = token.id;
      var forms = new Forms(token.string);
      self.analyses[id] = forms;
      loadToken(forms, id);
    });

    state.on('tokenRemoved', function(event, token) {
      var id = token.id;
      deleteFromIndex(id);
      delete self.analyses[id];
    });

    this.init = function () {
      abortOutstandingRequests();
      configure();
      self.emptyPostag = createEmptyPostag();
      self.analyses = seedAnalyses();
      loadInitalAnalyses();
      createSearchIndex();
      plugins.declareReady(self);
    };
  }
]);
