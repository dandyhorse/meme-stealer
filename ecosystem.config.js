module.exports = {
  apps: [
    {
      name: 'boosty',
      script: 'node',
      args: '-r tsconfig-paths/register .build/src/server.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
    },
  ],
};
