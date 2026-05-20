import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import 'dotenv/config';
import { readFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';


const __dirname = fileURLToPath(new URL('.', import.meta.url));

class TournamentBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.DirectMessages
            ],
            partials: [
                Partials.Channel,
                Partials.Message,
                Partials.GuildMember
            ]
        });

        this.client.commands = new Collection();
        this.client.cooldowns = new Collection();
        this.client.config = this.getConfig();
    }

    getConfig() {
        return {
            token: process.env.DISCORD_TOKEN,
            clientId: process.env.CLIENT_ID,
            guildId: process.env.GUILD_ID,
            firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
            firebaseDatabaseURL: process.env.FIREBASE_DATABASE_URL,
            firebaseConfig: {
                type: process.env.FIREBASE_TYPE,
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                clientId: process.env.FIREBASE_CLIENT_ID,
                authUri: process.env.FIREBASE_AUTH_URI,
                tokenUri: process.env.FIREBASE_TOKEN_URI,
                authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
                clientX509CertUrl: process.env.FIREBASE_CLIENT_CERT_URL
            }
        };
    }

    getFirebaseServiceAccount() {
        // Prefer individual env vars — works on Railway without a file
        const { firebaseConfig } = this.client.config;
        if (firebaseConfig.projectId && firebaseConfig.privateKey && firebaseConfig.clientEmail) {
            return firebaseConfig;
        }

        // Fall back to service account JSON file if path is set and valid
        const filePath = this.client.config.firebaseServiceAccountPath;
        if (filePath && !filePath.includes('BEGIN PRIVATE KEY')) {
            const serviceAccountPath = resolve(process.cwd(), filePath);
            return JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
        }

        throw new Error('Missing Firebase credentials. Set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables.');
    }

    async loadCommands() {
        const commandsPath = join(__dirname, 'commands');
        const commandFolders = await readdir(commandsPath);

        for (const folder of commandFolders) {
            const folderPath = join(commandsPath, folder);
            const commandFiles = (await readdir(folderPath)).filter(f => f.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = join(folderPath, file);
                const command = await import(pathToFileURL(filePath).href);
                if ('data' in command.default && 'execute' in command.default) {
                    this.client.commands.set(command.default.data.name, command.default);
                }
            }
        }
    }

    async loadEvents() {
        const eventsPath = join(__dirname, 'events');
        const eventFiles = (await readdir(eventsPath)).filter(f => f.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = join(eventsPath, file);
            const event = await import(pathToFileURL(filePath).href);
            console.log(`Loaded event: ${event.default.name} (${file})`);
            if (event.default.once) {
                this.client.once(event.default.name, (...args) => event.default.execute(...args));
            } else {
                this.client.on(event.default.name, (...args) => event.default.execute(...args));
            }
        }
    }

    async validatePrivilegedIntents() {
        const { GatewayIntentBits } = await import('discord.js');
        const intents = this.client.options?.intents;
        if (!intents) return;
        if (!intents.has(GatewayIntentBits.MessageContent)) {
            console.warn('[startup] Message Content intent not requested by the client. Enable Gateway Intent: MESSAGE CONTENT in Developer Portal and add GatewayIntentBits.MessageContent to the client.');
        }
        if (!intents.has(GatewayIntentBits.GuildMembers)) {
            console.warn('[startup] Server Members intent not requested by the client. Enable Gateway Intent: SERVER MEMBERS in Developer Portal and add GatewayIntentBits.GuildMembers to the client.');
        }

        // Heuristic checks using configured guild
        if (this.client.config.guildId) {
            try {
                const guild = await this.client.guilds.fetch(this.client.config.guildId);
                if (guild) {
                    try {
                        const members = await guild.members.fetch({ limit: 5 });
                        if ((members && members.size <= 1)) {
                            console.warn('[startup] Fetched <=1 guild member — Server Members intent may be disabled for this bot in the Developer Portal.');
                        } else {
                            console.log('[startup] Guild members fetched — Server Members intent appears available.');
                        }
                    } catch (err) {
                        console.warn('[startup] Could not fetch guild members. Server Members intent may be disabled in Developer Portal:', err?.message || err);
                    }
                }
            } catch (err) {
                console.warn('[startup] Could not fetch configured guild. Skipping guild-level intent checks.');
            }
        }
    }

    async initializeFirebase() {
        const { initializeApp, cert } = await import('firebase-admin/app');
        const { getDatabase } = await import('firebase-admin/database');
        const serviceAccount = this.getFirebaseServiceAccount();
        const databaseURL = this.client.config.firebaseDatabaseURL || `https://${serviceAccount.project_id || serviceAccount.projectId}-default-rtdb.firebaseio.com`;

        const app = initializeApp({
            credential: cert(serviceAccount),
            databaseURL
        });

        this.client.db = getDatabase(app);
    }

    async start() {
        try {
            await this.initializeFirebase();
            await this.loadCommands();
            await this.loadEvents();
            await this.client.login(this.client.config.token);
            await this.validatePrivilegedIntents();
            console.log('ACHILLES ESPORTS Tournament Bot is online!');
        } catch (error) {
            console.error('Failed to start bot:', error);
            process.exit(1);
        }
    }
}

const bot = new TournamentBot();
bot.start();
