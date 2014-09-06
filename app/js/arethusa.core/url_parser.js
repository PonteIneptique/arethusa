"use strict";

angular.module('arethusa.core').factory('urlParser', [
  function() {
    function docUrlParser(url) {
      var parser = document.createElement('a');
      parser.href = url;
      return parser;
    }

    function parseSearch(url) {
      var search = docUrlParser(url).search.slice(1);
      var params = search.split('&');
      return arethusaUtil.inject({}, params, function(memo, param) {
        var parts = param.split('=');
        var key = parts[0];
        var val = parts[1] || true;
        var array = memo[key];
        var newVal  = array ? arethusaUtil.toAry(array).concat([val]) : val;
        memo[key] = newVal;
      });
    }

    function toParam(k, v) {
      return k + '=' + v;
    }

    function updateUrl(parser, href) {
      var newUrl = parser.url.replace(docUrlParser(parser.url).search, '?');
      var params = [];
      angular.forEach(parser.params, function(value, key) {
        if (angular.isArray(value)) {
          angular.forEach(value, function(el) {
            params.push(toParam(key, el));
          });
        } else {
          params.push(toParam(key, value));
        }
      });
      parser.url = newUrl + params.join('&');
    }

    function UrlParser(url) {
      var self = this;

      this.url = url;
      this.params = parseSearch(url);

      this.set = function(paramsOrKey, val) {
        if (angular.isString(paramsOrKey) && val) {
          this.params[paramsOrKey] = val;
        } else {
          this.params = paramsOrKey;
        }

        updateUrl(self);
      };
    }

    return function(url) {
      return new UrlParser(url);
    };
  }
]);
