'use strict';
angular.module('arethusa.core').directive('foreignKeys',[
  'keyCapture',
  'languageSettings',
  function (keyCapture, languageSettings) {
    return {
      restrict: 'A',
      scope: {
        ngChange: '&',
        ngModel: '@',
        foreignKeys: '='
      },
      link: function (scope, element, attrs) {
        var parent = scope.$parent;

        function extractLanguage() {
          return (languageSettings.getFor('treebank') || {}).lang;
        }

        function lang() {
          return scope.foreignKeys || extractLanguage();
        }

        // This will not detect changes right now
        function placeHolderText() {
          var language = languageSettings.langNames[lang()];
          return  language ? language + ' input enabled!' : '';
        }
        element.attr('placeholder', placeHolderText);

        element.on('keydown', function (event) {
          var input = event.target.value;
          if (lang) {
            var fK = keyCapture.getForeignKey(event, lang);
            if (fK === false) {
              return false;
            }
            if (fK === undefined) {
              return true;
            } else {
              event.target.value = input + fK;
              scope.$apply(function() {
                parent.$eval(scope.ngModel + ' = i + k', { i: input, k: fK });
                scope.ngChange();
              });
              return false;
            }
          } else {
            return true;
          }
        });
      }
    };
  }
]);
