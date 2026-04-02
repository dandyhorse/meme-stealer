import * as readline from 'readline';

import { tgClient } from '@config';

// Interactive CLI utility to authenticate the Telegram userbot and generate a session string.
// Run this once to obtain STRING_SESSION, then paste it into your .env file.
// Handles phone number, 2FA password, and login code prompts interactively.
export const connect = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  await tgClient.start({
    phoneNumber: async () => {
      return await question('Введите номер телефона: ');
    },
    password: async () => {
      return await question('Введите пароль 2FA (Enter если нет): ');
    },
    phoneCode: async () => {
      // This callback fires AFTER the phone number is submitted,
      // once Telegram has already sent the verification code
      return await question('Введите код из Telegram: ');
    },
    onError: (err) => console.error(err),
  });

  console.log('Подключено!');
  console.log('Сохраните сессию в .env:');
  // Print the serialized session string — this is what allows reconnecting without re-authenticating
  console.log('STRING_SESSION=' + tgClient.session.save());

  rl.close();
}