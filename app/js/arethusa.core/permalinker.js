"use strict";

angular.module('arethusa.core').service('permalinker', [
  'state',
  'navigator',
  '$location',
  'urlParser',
  'idHandler',
  function(state, navigator, $location, urlParser, idHandler) {
    function ids() {
      return arethusaUtil.inject([], state.clickedTokens, function(memo, id, _) {
        memo.push(idHandler.formatId(id, '%w'));
      });
    }

    this.get = function() {
      var url = urlParser($location.absUrl());
      var chunk = navigator.status.currentId;
      var param = state.conf.chunkParam;
      url.set(param, chunk);

      // TODO
      // This is currently hardcoded to the idea of a token preselector param
      // w - which is in most cases what the TreebankRetriever uses.
      // It's currently not easy to access this param - we will have more work
      // to do here once we use multiple retrievers anyway, so we can get away
      // with this hack for now.
      url.set('w', ids());
      return url.url;
    };
  }
]);
