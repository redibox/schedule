global.HOOK_NAME = 'schedule';
const Redibox = require('redibox').default;
const UserHook = require('./../src/hook');

global.some = {
  coolFunction(data) {
    console.log('COOL');
    console.dir(data);
  },
  unCoolFunc(data) {
    console.log('UNCOOL');
    console.dir(data);
  },
};

const config = {
  hooks: {},
  schedule: {
    schedules: [],
  },
};

config.hooks[global.HOOK_NAME] = UserHook;

before(done => {
  global.RediBox = new Redibox(config, () => {
    global.Hook = RediBox.hooks[global.HOOK_NAME];
    done();
  });
});

beforeEach((done) => {
  RediBox.client.flushall().then(() => done());
});

after(() => {
  RediBox.disconnect();
});
