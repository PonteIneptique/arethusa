"use strict";

describe('permalinker', function() {
  var state, navigator, permalinker;

  beforeEach(function() {
    module("arethusa.core", function($provide) {
      $provide.value('$location', arethusaMocks.$location());
      $provide.value('configurator', arethusaMocks.configurator());
    });

    inject(function(_state_, _navigator_, _permalinker_) {
      state = _state_;
      state.conf = {};
      state.conf.chunkParam = "chunk";
      navigator = _navigator_;
      navigator.init();
      permalinker = _permalinker_;
    });
  });

  describe('this.get()', function() {
    it('returns a permalink to the current situation', function() {
      navigator.status.currentId = 3;
      state.multiSelect('0001', '0002');
      var link = permalinker.get();
      var res  = "http://www.test.com/doc=123&chunk=3&w=1&w=2";
      expect(link).toEqual(res);
    });
  });
});
