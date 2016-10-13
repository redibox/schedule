global.HOOK_NAME = 'schedule';
const Redibox = require('redibox').default;
const UserHook = require('./../src/hook');

const config = {
  hooks: {},
  schedule: {
    enabled: true,
    schedules: [],
  },
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
  pubsub: {
    publisher: true,
    subscriber: true,
  },
};

config.hooks[global.HOOK_NAME] = UserHook;

before((done) => {
  global.RediBox = new Redibox(config, () => {
    global.Hook = RediBox.hooks[global.HOOK_NAME];
    if (config.redis && config.redis.hosts) {
      RediBox.cluster.flushall().then(() => done());
    } else {
      RediBox.client.flushall().then(() => done());
    }
  });
});

beforeEach((done) => {
  if (config.redis && config.redis.hosts) {
    RediBox.cluster.flushall().then(() => done());
  } else {
    RediBox.client.flushall().then(() => done());
  }
});

after(() => {
  RediBox.disconnect();
});
