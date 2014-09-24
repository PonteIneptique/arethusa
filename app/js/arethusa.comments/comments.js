"use strict";

angular.module('arethusa.comments').service('comments', [
  'state',
  'configurator',
  'navigator',
  'notifier',
  'plugins',
  'keyCapture',
  'translator',
  function(state, configurator, navigator, notifier,
           plugins, keyCapture, translator) {
    var self = this;
    this.name = "comments";

    var retriever, persister;
    var idMap;
    var commentIndex;
    var fullTextIndex;

    this.externalDependencies = [
      "bower_components/lunr.js/lunr.min.js"
    ];

    this.filter = {};
    this.reverseIndex = {};

    this.defaultConf = {
      template: "templates/arethusa.comments/comments.html",
      contextMenu: true,
      contextMenuTemplate: "templates/arethusa.comments/context_menu.html"
    };

    function configure() {
      configurator.getConfAndDelegate(self);
      retriever = configurator.getRetriever(self.conf.retriever);
      persister = retriever;
    }

    // Currently only supports single sentences!
    function retrieveComments() {
      self.comments = [];
      self.docLevelComments = [];
      retriever.get(navigator.status.currentIds, function(comments) {
        self.comments = comments;
        self.docLevelComments = retriever.docLevelComments();
        createIndices();
      });
    }

    function fullText(commentContainer) {
      return arethusaUtil.map(commentContainer.comments, function(el) {
        return el.comment;
      }).join(' ');
    }

    function addToIndex(commentContainer) {
      var ids = commentContainer.ids;
      var id = ids.join('|'); // using a . would interfere with aU.setProperty
      commentIndex[id] = commentContainer;
      fullTextIndex.add({ id: id, body: fullText(commentContainer) });

      angular.forEach(ids, function(tId) {
        arethusaUtil.setProperty(self.reverseIndex, tId + '.' + id, true);
      });
    }

    function lunrIndex() {
      return lunr(function() {
        this.field('body');
        this.ref('id');
      });
    }

    function createIndices() {
      commentIndex = {};
      self.reverseIndex = {};
      fullTextIndex = lunrIndex();
      angular.forEach(self.comments, addToIndex);
    }

    function getFromIndex(ids) {
      return arethusaUtil.map(ids, function(el) {
        return commentIndex[el];
      });
    }

    function selectionFilter() {
      var targets = {};
      angular.forEach(state.selectedTokens, function(token, id) {
        angular.extend(targets, self.reverseIndex[id]);
      });
      return Object.keys(targets).sort();
    }

    function searchText(txt, otherIds) {
      // A former filter returned empty, so we can just return,
      // but it could also be that this fn is the first filter
      // applied.
      if (otherIds && !otherIds.length) return otherIds;

      var hits = fullTextIndex.search(txt);
      var ids = arethusaUtil.map(hits, function(el) { return el.ref; });
      return otherIds ? arethusaUtil.intersect(ids, otherIds) : ids;
    }

    function filteredComments() {
      var sel = self.filter.selection;
      var txt = self.filter.fullText;

      if (sel || txt) {
        var ids;
        if (sel) { ids = selectionFilter(); }
        if (txt) { ids = searchText(txt, ids); }
        return getFromIndex(ids);
      }
    }

    this.currentComments = function() {
      return filteredComments() || self.comments;
    };

    this.commentCountFor = function(token) {
      var count = 0;
      var commentIds = self.reverseIndex[token.id];
      if (commentIds) {
        var idArr = Object.keys(commentIds);
        angular.forEach(getFromIndex(idArr), function(commentObj) {
          count = count + commentObj.comments.length;
        });
      }
      return count;
    };

    function Comment(ids, sId, comment, type) {
      this.ids = ids;
      this.sId = sId;
      this.comment = comment;
    }

    var translations = {};
    translator('comments.successMessage', translations, 'success');
    translator('comments.errorMessage', translations, 'error');
    translator('comments.selectFirst', translations, 'selectFirst');

    function saveSuccess(fn) {
      return function(commentContainer) {
        // Could be that this chunk had no comments before,
        // so we need to get the just newly created object
        // from the retriever and build up all our indices.
        if (self.comments) {
          addToIndex(commentContainer);
        } else {
          retrieveComments();
        }
        fn();
        notifier.success(translations.success);
      };
    }

    function saveError() {
      notifier.error(translations.error);
    }

    // Bad system - not compatible with multi sentences
    this.createNewComment = function(ids, comment, successFn) {
      var newComment = new Comment(ids, navigator.status.currentIds[0], comment);
      persister.save(newComment, saveSuccess(successFn), saveError);
    };

    this.goToComments = function(tId) {
      state.deselectAll();
      state.selectToken(tId);
      self.filter.selection = true;
      self.filter.fullText = '';
      plugins.setActive(self);
    };

    function openCommentField() {
      if (state.hasClickSelections()) {
        self.creator = true;
        plugins.setActive(self);
      } else {
        notifier.info(translations.selectFirst);
      }
    }

    keyCapture.initCaptures(function(kC) {
      return {
        comments: [
          kC.create('create', openCommentField, 'ctrl-K')
        ]
      };
    });

    this.init = function() {
      configure();
      retrieveComments();
    };
  }
]);
