import dotenv from 'dotenv';
dotenv.config();

import { db } from './client';
import { ChatState } from '../generated/client';

const CHANNELS_TO_SEED = [
  { chatId: -1001335331263, title: 'СЛАВА БОГУ У НАС ЕСТЬ МЕМЫ' },
  { chatId: -1001283644155, title: 'шерстяные проказники • коты' },
  { chatId: -1002132717195, title: 'Мемов на 2-3 дня' },
  { chatId: -1002230852099, title: 'ОТЕЦ МЕМÈСНЫЙ' },
  { chatId: -1001819211956, title: 'алё, нет, ето андрюха' },
  { chatId: -1001787081019, title: 'Свежая Булдка' },
  { chatId: -1001142011374, title: 'Бляцкие коты' },
  { chatId: -1001478363441, title: 'мемы про котов (по ржать)' },
  { chatId: -1001224122704, title: 'Afro-American Side Of The Moon' },
  { chatId: -1001064421066, title: 'Dankest Memes' },
  { chatId: -1001107552211, title: 'конал бло́жэй' },
  { chatId: -1001350302883, title: 'Lenin Street' },
  { chatId: -1001786724036, title: 'Банановые истории' },
  { chatId: -1002107467094, title: 'Пушистый канал' },
  { chatId: -1001086186607, title: 'Ворованные мемы' },
  { chatId: -1001670216674, title: 'потешные котята на каждый день' },
  { chatId: -1001163283262, title: 'Гифки от дройди' },
  { chatId: -1002604416373, title: 'топтышка' },
  { chatId: -1001233194631, title: 'дом с говном' },
  { chatId: -1002332861320, title: 'кошка ваще норм' },
  { chatId: -1001908909419, title: 'котямбусы и компудахтеры' },
];

async function seed() {
  console.log('Seeding channels...');

  for (const channel of CHANNELS_TO_SEED) {
    await db.chat.upsert({
      where: { chatId: channel.chatId },
      update: { title: channel.title },
      create: {
        chatId: channel.chatId,
        title: channel.title,
        state: ChatState.FAVORITE,
      },
    });
    console.log(`  ✓ ${channel.title}`);
  }

  console.log(`\nSeeded ${CHANNELS_TO_SEED.length} channels.`);
}

seed()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
