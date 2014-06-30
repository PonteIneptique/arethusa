"use strict";

angular.module('arethusa.depTree').directive('unusedTokenHighlighter', [
  'state',
  function(state) {
    return {
      restrict: 'A',
      scope: {
        highlightMode: '@unusedTokenHighlighter',
        style: '=unusedTokenStyle'
      },
      link: function(scope, element, attrs) {
        var unusedTokens;
        var headWatches = [];
        var style = scope.style || { "font-style": "italic" };
        var highlightMode = !!scope.highlightMode;
        scope.s = state;

        function tokensWithoutHeadCount() {
          return state.countTokens(function (token) {
            return hasNoHead(token);
          });
        }

        function hasNoHead(token) {
          return !(token.head || {}).id;
        }

        function findUnusedTokens() {
          angular.forEach(state.tokens, function(token, id) {
            if (hasNoHead(token)) {
              scope.unusedCount++;
              unusedTokens[id] = true;
            }
          });
        }

        function initHeadWatches() {
          destroyOldHeadWatches();
          angular.forEach(state.tokens, function(token, id) {
            var childScope = scope.$new();
            childScope.head = token.head;
            childScope.id   = id;
            childScope.$watch('head.id', function(newVal, oldVal) {
              if (newVal !== oldVal) {
                if (newVal) {
                  scope.unusedCount--;
                  delete unusedTokens[id];
                  if (highlightMode) removeStyle(id);
                } else {
                  scope.unusedCount++;
                  unusedTokens[id] = true;
                  if (highlightMode) state.addStyle(id, style);
                }
              }
            });
            headWatches.push(childScope);
          });
        }

        function destroyOldHeadWatches() {
          angular.forEach(headWatches, function(childScope, i) {
            childScope.$destroy();
          });
          headWatches = [];
        }


        function init() {
          scope.total = state.totalTokens;
          scope.unusedCount = 0;
          unusedTokens = {};
          findUnusedTokens();
          initHeadWatches();
          if (highlightMode) applyHighlighting();
        }

        function applyHighlighting() {
          angular.forEach(unusedTokens, function(val, id) {
            state.addStyle(id, style);
          });
        }

        function removeStyle(id) {
          var styles = Object.keys(style);
          state.removeStyle(id, styles);
        }

        function unapplyHighlighting() {
          angular.forEach(unusedTokens, function(val, id) {
            removeStyle(id);
          });
        }

        element.bind('click', function() {
          scope.$apply(function() {
            if (highlightMode) {
              unapplyHighlighting();
            } else {
              applyHighlighting();
            }
          });
          highlightMode = !highlightMode;
        });

        scope.$watch('s.tokens', function(newVal, oldVal) {
          init();
        });
      },
      template: '{{ unusedCount }} of {{ total }} unused'
    };
  }
]);
