import { Command } from 'commander';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('media-backup')
  .description('Утилита для поиска, сжатия и бэкапа тяжелых медиафайлов')
  .version('1.0.0')
  .argument('<dir>', 'Директория для сканирования')
  .option('-s, --size <size>', 'Минимальный размер файла в МБ', '50')
  .action(async (dir, options) => {
    const minSizeMb = parseFloat(options.size);
    const targetDir = path.resolve(dir);

    console.log(pc.blue(`\n🚀 Запуск сканирования директории: ${targetDir}`));
    console.log(pc.gray(`Ищем файлы крупнее: ${minSizeMb} МБ\n`));

    // Проверяем существование асинхронно
    try {
      await fs.promises.access(targetDir);
    } catch {
      console.log(pc.red(`❌ Ошибка: Директория "${targetDir}" не существует или недоступна.`));
      process.exit(1);
    }

    // Запускаем асинхронный обход
    await scanDirectory(targetDir, minSizeMb);
    console.log(pc.blue('\n✨ Сканирование успешно завершено.'));
  });

// Асинхронная функция обхода папок с защитой от ошибок доступа и симлинков
export async function scanDirectory(currentPath: string, minSizeMb: number) {
  try {
    // Читаем директорию асинхронно
    const files = await fs.promises.readdir(currentPath);

    for (const file of files) {
      const fullPath = path.join(currentPath, file);

      try {
        // Используем lstat, чтобы не переходить по символическим ссылкам автоматически
        const stat = await fs.promises.lstat(fullPath);

        // Игнорируем симлинки во избежание циклической рекурсии
        if (stat.isSymbolicLink()) {
          continue; 
        }

        if (stat.isDirectory()) {
          // Рекурсивный вызов через await
          await scanDirectory(fullPath, minSizeMb);
        } else if (stat.isFile()) {
          // Проверяем размер файла
          const fileSizeMb = stat.size / (1024 * 1024);
          
          if (fileSizeMb >= minSizeMb) {
            console.log(
              `${pc.yellow('⚠️ Найден тяжелый файл:')} ${file} ${pc.green(`[${fileSizeMb.toFixed(2)} МБ]`)}`
            );
            // TODO: Вызов FFmpeg и загрузка в S3
          }
        }
      } catch (fileError) {
        // Ошибка для конкретного файла (например, locked системный файл в Windows)
        // Позволяет продолжить сканирование остальных файлов в папке
        console.error(pc.red(`⚠️ Нет доступа к файлу/папке: ${fullPath}`));
      }
    }
  } catch (dirError) {
    // Ошибка чтения самой директории (например, "Отказано в доступе")
    console.error(pc.red(`❌ Ошибка при чтении каталога ${currentPath}`));
  }
}

program.parse(process.argv);
