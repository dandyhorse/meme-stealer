module.exports = {
  apps: [
    {
      name: 'meme-stealer',
      script: 'node',
      args: '-r tsconfig-paths/register .build/src/index.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
