global.HOOK_NAME = 'schedule';
const Redibox = require('redibox').default;
const UserHook = require('./src/hook');

global.some = {
  coolFunction(data) {
    // console.log('COOL');
    return Promise.resolve();
  },
  unCoolFunc(data) {
    // console.log('UNCOOL');
    return Promise.resolve();
  },
};

const config = {
  hooks: {},
  redis: {
    connectionTimeout: 2000,
    hosts: [
      {
        host: '127.0.0.1',
        port: 30001,
      },
      {
        host: '127.0.0.1',
        dropBufferSupport: true,
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
  schedule: {
    enabled: true,
    schedules: [
      // {
      //   name: 'in1minuteEvery5seconds',
      //   runs: 'some.coolFunction',
      //   interval: 'every 1 seconds',
      // },
      {
        name: 'every1sec',
        runs: 'some.coolFunction',
        interval: 'every 1 seconds',
      },
      // {
      //   name: 'every3sec',
      //   runs: 'some.coolFunction',
      //   interval: 'every 3 seconds',
      // },
      // {
      //   name: 'every15secs',
      //   runs: 'some.unCoolFunc',
      //   interval: 'every 15 seconds',
      // },
      // {
      //   name: 'every30secs',
      //   runs: 'some.unCoolFunc',
      //   interval: 'every 30 seconds',
      // },
      // {
      //   name: 'every1minute',
      //   runs: 'some.unCoolFunc',
      //   interval: 'every 1 minutes',
      // },
      // {
      //   name: 'every2minute',
      //   runs: 'some.unCoolFunc',
      //   interval: 'every 2 minutes',
      // },
    ],
  },
  // log: { level: 'verbose' },
};
config.hooks[global.HOOK_NAME] = UserHook;
//
// const clusterConfig = {
//   log: { level: 'info' },
//   redis: {
//     connectionTimeout: 2000,
//     hosts: [
//       {
//         host: '127.0.0.1',
//         port: 30001,
//       },
//       {
//         host: '127.0.0.1',
//         port: 30002,
//       },
//       {
//         host: '127.0.0.1',
//         port: 30003,
//       },
//       {
//         host: '127.0.0.1',
//         port: 30004,
//       },
//       {
//         host: '127.0.0.1',
//         port: 30005,
//       },
//       {
//         host: '127.0.0.1',
//         port: 30006,
//       },
//     ],
//   },
//   hooks: {},
// };

// clusterConfig.hooks[global.HOOK_NAME] = UserHook;

global.RediBox = new Redibox(config, () => {
  global.Hook = RediBox.hooks[global.HOOK_NAME];
});
