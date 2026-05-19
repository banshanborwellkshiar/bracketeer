import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const scope = process.argv.includes('--global') ? 'global' : 'guild';

const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID'];
if (scope === 'guild') requiredEnv.push('GUILD_ID');

for (const name of requiredEnv) {
    if (!process.env[name]) {
        throw new Error(`Missing ${name}. Add it to .env before registering commands.`);
    }
}

const loadCommands = async () => {
    const commands = [];
    const commandsPath = join(__dirname, 'commands');
    const commandFolders = await readdir(commandsPath);

    for (const folder of commandFolders) {
        const folderPath = join(commandsPath, folder);
        const commandFiles = (await readdir(folderPath)).filter((file) => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = join(folderPath, file);
            const command = await import(pathToFileURL(filePath).href);

            if (!command.default?.data?.name || !command.default?.data?.description) {
                console.warn(`Skipping ${file}: missing command data.`);
                continue;
            }

            commands.push(command.default.data);
        }
    }

    return commands;
};

const commands = await loadCommands();
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const route = scope === 'global'
    ? Routes.applicationCommands(process.env.CLIENT_ID)
    : Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID);

console.log(`Registering ${commands.length} ${scope} slash commands...`);

await rest.put(route, { body: commands });

console.log(`Registered ${commands.length} ${scope} slash commands successfully.`);
