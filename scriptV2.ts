import { Command } from 'commander';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import * as p from '@clack/prompts';
import archiver from 'archiver';

const program = new Command();

program
  .name('media-backup')
  .description('Утилита для поиска, сжатия и бэкапа тяжелых медиафайлов')
  .version('1.0.0')
  // Сделали аргумент необязательным [dir], чтобы можно было запустить просто как `node index.js`
  .argument('[dir]', 'Директория для сканирования (опционально)')
  .option('-s, --size <size>', 'Минимальный размер файла в МБ', '50')
  .action(async (dir, options) => {
    let targetDir = dir;

    console.log(pc.blue('\n🚀 Запуск медиа-бэкапера\n'));

    // 1. Если папка не передана в аргументах, спрашиваем её интерактивно
    if (!targetDir) {
      const selectedDir = await p.text({
        message: 'Введите путь к директории, которую нужно отсканировать:',
        placeholder: './media',
        validate(value) {
          if (!value.trim()) return 'Путь не может быть пустым!';
        },
      });

      if (p.isCancel(selectedDir)) {
        console.log(pc.yellow('\n👋 Операция отменена пользователем.'));
        process.exit(0);
      }

      targetDir = selectedDir as string;
    }

    // Приводим путь к абсолютному виду
    targetDir = path.resolve(targetDir);

    // Проверяем существование папки
    try {
      await fs.promises.access(targetDir);
      const stat = await fs.promises.stat(targetDir);
      if (!stat.isDirectory()) {
        console.log(pc.red(`❌ Ошибка: Указанный путь "${targetDir}" не является папкой.`));
        process.exit(1);
      }
    } catch {
      console.log(pc.red(`❌ Ошибка: Директория "${targetDir}" не существует или недоступна.`));
      process.exit(1);
    }

    // 2. Спрашиваем, нужно ли сжимать файлы
    const shouldZip = await p.confirm({
      message: 'Сжимать найденные тяжелые файлы в ZIP-архив?',
      initialValue: true,
    });

    if (p.isCancel(shouldZip)) {
      console.log(pc.yellow('\n👋 Операция отменена пользователем.'));
      process.exit(0);
    }

    console.log(pc.gray(`\nИщем файлы крупнее: ${options.size} МБ в "${targetDir}"...\n`));

    // Запускаем сканирование
    const minSizeMb = parseFloat(options.size);
    await scanDirectory(targetDir, minSizeMb, shouldZip);
    console.log(pc.blue('\n✨ Сканирование успешно завершено.'));
  });

// Функция для архивации файла в Zip
async function zipFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const zipPath = `${filePath}.zip`;
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(zipPath));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.file(filePath, { name: path.basename(filePath) });
    archive.finalize();
  });
}

export async function scanDirectory(currentPath: string, minSizeMb: number, shouldZip: boolean) {
  try {
    const files = await fs.promises.readdir(currentPath);

    for (const file of files) {
      const fullPath = path.join(currentPath, file);

      try {
        const stat = await fs.promises.lstat(fullPath);

        if (stat.isSymbolicLink()) {
          continue; 
        }

        if (stat.isDirectory()) {
          await scanDirectory(fullPath, minSizeMb, shouldZip);
        } else if (stat.isFile()) {
          if (file.endsWith('.zip')) continue;

          const fileSizeMb = stat.size / (1024 * 1024);
          
          if (fileSizeMb >= minSizeMb) {
            console.log(
              `${pc.yellow('⚠️ Найден тяжелый файл:')} ${file} ${pc.green(`[${fileSizeMb.toFixed(2)} МБ]`)}`
            );

            if (shouldZip) {
              const spinner = p.spinner();
              spinner.start(`Архивация файла ${file}...`);
              
              try {
                const resultPath = await zipFile(fullPath);
                spinner.stop(`${pc.green('✅ Сжато в:')} ${path.basename(resultPath)}`);
              } catch (zipErr) {
                spinner.stop(`${pc.red('❌ Ошибка сжатия файла')} ${file}`);
              }
            }
          }
        }
      } catch (fileError) {
        console.error(pc.red(`⚠️ Нет доступа к файлу/папке: ${fullPath}`));
      }
    }
  } catch (dirError) {
    console.error(pc.red(`❌ Ошибка при чтении каталога ${currentPath}`));
  }
}

program.parse(process.argv);
