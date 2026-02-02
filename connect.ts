import * as readline from 'readline';

import { tgClient } from '@config';

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
      // Этот колбэк вызовется ПОСЛЕ отправки номера,
      // когда Telegram уже отправил код
      return await question('Введите код из Telegram: ');
    },
    onError: (err) => console.error(err),
  });

  console.log('Подключено!');
  console.log('Сохраните сессию в .env:');
  console.log('STRING_SESSION=' + tgClient.session.save());

  rl.close();
}