global.HOOK_NAME = 'schedule';
const Redibox = require('redibox').default;
const UserHook = require('./../src/hook');


global.defaultScheduleTest = function defaultScheduleTest(...args) {
  if (global.defaultScheduleRunner) return global.defaultScheduleRunner.call(this, ...args);
  return Promise.resolve();
};


const configBase = {
  hooks: {},
  schedule: {
    enabled: true,
    schedules: [
      {
        name: 'everySecDefaultFunc',
        runs: 'defaultScheduleTest',
        interval: 'every 1 seconds',
      },
    ],
  },
  pubsub: {
    publisher: true,
    subscriber: true,
  },
  // log: { level: 'verbose' },
};

const config = Object.assign({}, configBase, {});
const configCluster = Object.assign({}, configBase, {
  redis: {
    connectionTimeout: 2000,
    hosts: [
      {
        host: '127.0.0.1',
        port: 30001,
      },
      {
        host: '127.0.0.1',
        port: 30002,
      },
      {
        host: '127.0.0.1',
        port: 30003,
      },
      {
        host: '127.0.0.1',
        port: 30004,
      },
      {
        host: '127.0.0.1',
        port: 30005,
      },
      {
        host: '127.0.0.1',
        port: 30006,
      },
    ],
  },
});

config.hooks[global.HOOK_NAME] = UserHook;
configCluster.hooks[global.HOOK_NAME] = UserHook;

before((done) => {
  global.RediBox = new Redibox(config, () => {
    global.Hook = global.RediBox.hooks[global.HOOK_NAME];
    global.RediBoxClustered = new Redibox(configCluster, () => {
      global.HookClustered = global.RediBoxClustered.hooks[global.HOOK_NAME];
      setTimeout(done, 1000);
    });
  });
});

beforeEach(function beforeEach(done) {
  if (this.currentTest.title.startsWith('CLUSTERED - ')) {
    this.currentTest.hook = global.HookClustered;
    RediBoxClustered.cluster.flushall().then(() => done());
    return null;
  }

  this.currentTest.hook = global.Hook;

  if (this.currentTest.title.startsWith('...')) {
    const newTitle = this.currentTest.title.replace('...', 'CLUSTERED -');
    this.currentTest.title = this.currentTest.title.replace('...', 'SINGLE -');
    const fn = this.currentTest.fn;
    describe(newTitle, function () {
      it(newTitle, fn);
    });
    RediBox.client.flushall().then(() => done());
    return null;
  }

  return done();
});

after(() => {
  RediBox.disconnect();
  RediBoxClustered.disconnect();
});
