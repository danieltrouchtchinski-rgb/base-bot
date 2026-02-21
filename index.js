const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");

// ANTI‑CRASH
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught Exception:", err));
process.on("uncaughtExceptionMonitor", (err) => console.error("Uncaught Exception Monitor:", err));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.login(process.env.TOKEN);

// -----------------------------
// CONFIG RÉACTION 👍
// -----------------------------

const channelId = "1472520910937522259"; // Salon du message de bienvenue
const roleId = "1470070588033728789"; // Rôle à donner
const emoji = "👍";

// -----------------------------
// CONFIG TICKETS
// -----------------------------

const supportChannelId = "1472545749576192010"; // Salon support
const staffRoleId = "1472545876189905037"; // Rôle staff
const adminId = "1238123426959462432"; // Admin à notifier

// -----------------------------
// COOLDOWN TICKETS
// -----------------------------

const ticketCooldown = new Map(); // userId -> timestamp
const COOLDOWN_TIME = 60 * 60 * 1000; // 1 heure

// -----------------------------
// MODÉRATION : GROS MOTS & AVERTISSEMENTS
// -----------------------------

const bannedWords = [
    "pute",
    "fdp",
    "ntm",
    "merde",
    "enculé",
    "salope"
];

const bannedPatterns = [
    /p[\W_0-9]*u[\W_0-9]*t[\W_0-9]*e/i,
    /f[\W_0-9]*d[\W_0-9]*p/i,
    /n[\W_0-9]*t[\W_0-9]*m/i,
    /m[\W_0-9]*e[\W_0-9]*r[\W_0-9]*d[\W_0-9]*e?/i,
    /e[\W_0-9]*n[\W_0-9]*c[\W_0-9]*u[\W_0-9]*l[\W_0-9]*[eé]/i,
    /s[\W_0-9]*a[\W_0-9]*l[\W_0-9]*o[\W_0-9]*p[\W_0-9]*e/i
];

const warnings = new Map();
const MAX_WARNINGS = 3;

const logChannelId = "1474819277092552724";

// Normalisation stricte
function normalizeForFilter(text) {
    let t = text.toLowerCase();

    const leetMap = {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "€": "e",
        "$": "s",
        "µ": "u"
    };

    t = t
        .split("")
        .map(ch => leetMap[ch] || ch)
        .join("");

    t = t.replace(/[^a-zàâäéèêëîïôöùûüç]/g, "");

    return t;
}

// -----------------------------
// BOT READY
// -----------------------------

client.on("ready", async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);

    const channel = await client.channels.fetch(channelId);
    const msg = await channel.send(
        "Bienvenue sur le serveur. Pour confirmer continuer veuillez cliquer sur l’emoji 👍 ci‑dessous."
    );
    await msg.react(emoji);

    const supportChannel = await client.channels.fetch(supportChannelId);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("open_ticket")
            .setLabel("🎟️ Ouvrir un ticket")
            .setStyle(ButtonStyle.Primary)
    );

    await supportChannel.send({
        content: "Besoin d’aide ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket.",
        components: [row]
    });
});

// -----------------------------
// RÉACTION 👍
// -----------------------------

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) await reaction.fetch();

    if (reaction.message.channel.id !== channelId) return;
    if (reaction.emoji.name !== emoji) return;

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id);

    member.roles.add(roleId)
        .then(() => console.log(`Rôle ajouté à ${user.tag}`))
        .catch(console.error);
});

// -----------------------------
// SYSTÈME DE TICKETS + BOUTONS LOGS
// -----------------------------

client.on("interactionCreate", async interaction => {
    if (interaction.isButton()) {
        const { customId } = interaction;

        // --- OUVERTURE DU TICKET ---
        if (customId === "open_ticket") {
            const userId = interaction.user.id;
            const now = Date.now();

            if (ticketCooldown.has(userId)) {
                const lastTime = ticketCooldown.get(userId);
                const timePassed = now - lastTime;

                if (timePassed < COOLDOWN_TIME) {
                    const remaining = Math.ceil((COOLDOWN_TIME - timePassed) / 60000);

                    return interaction.reply({
                        content: `⏳ Tu as déjà ouvert un ticket récemment. Tu pourras en rouvrir un dans **${remaining} minutes**.`,
                        ephemeral: true
                    });
                }
            }

            ticketCooldown.set(userId, now);

            const guild = interaction.guild;

            const ticketChannel = await guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: 0,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: staffRoleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    }
                ]
            });

            const adminUser = await client.users.fetch(adminId);
            adminUser.send(`${interaction.user.username} a ouvert un ticket.`).catch(() => {});

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("close_ticket")
                    .setLabel("🔒 Fermer le ticket")
                    .setStyle(ButtonStyle.Danger)
            );

            await ticketChannel.send({
                content: `🎟️ **Ticket ouvert !**\nBonjour ${interaction.user}, merci d’avoir ouvert un ticket.\nExplique ton problème ici, un membre du staff te répondra rapidement.`,
                components: [closeRow]
            });

            await interaction.reply({
                content: `Ton ticket a été créé : ${ticketChannel}`,
                ephemeral: true
            });
        }

        // --- FERMETURE DU TICKET ---
        if (customId === "close_ticket") {
            await interaction.channel.delete().catch(console.error);
        }

        // --- BOUTON DÉBANNIR ---
        if (customId.startsWith("unban_")) {
            const userId = customId.split("_")[1];
            const member = interaction.member;

            if (!member.roles.cache.has(staffRoleId)) {
                return interaction.reply({
                    content: "❌ Tu n’as pas la permission d’utiliser ce bouton.",
                    ephemeral: true
                });
            }

            try {
                await interaction.guild.members.unban(userId);
                await interaction.reply({
                    content: `✅ L’utilisateur <@${userId}> a été débanni.`,
                    ephemeral: true
                });
            } catch {
                await interaction.reply({
                    content: `⚠️ Impossible de débannir l’utilisateur <@${userId}>.`,
                    ephemeral: true
                });
            }
        }

        // --- BOUTON INVITATION ---
        if (customId.startsWith("invite_")) {
            const userId = customId.split("_")[1];
            const member = interaction.member;

            if (!member.roles.cache.has(staffRoleId)) {
                return interaction.reply({
                    content: "❌ Tu n’as pas la permission d’utiliser ce bouton.",
                    ephemeral: true
                });
            }

            try {
                const guild = interaction.guild;
                const channel = await guild.channels.fetch(channelId);
                const invite = await channel.createInvite({
                    maxUses: 1,
                    maxAge: 60 * 60,
                    unique: true
                });

                const user = await client.users.fetch(userId);
                await user.send({
                    content: `🔓 Tu as reçu une nouvelle invitation pour rejoindre **${guild.name}** : ${invite.url}`
                });

                await interaction.reply({
                    content: `✅ Invitation envoyée en DM à <@${userId}>.`,
                    ephemeral: true
                });
            } catch {
                await interaction.reply({
                    content: `⚠️ Impossible d’envoyer une invitation à <@${userId}>.`,
                    ephemeral: true
                });
            }
        }
    }
});

// -----------------------------
// MODÉRATION AUTOMATIQUE : GROS MOTS (STRICTE)
// -----------------------------

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const originalContent = message.content;
    if (!originalContent) return;

    const normalized = normalizeForFilter(originalContent);
    const lower = originalContent.toLowerCase();

    const hasBasic = bannedWords.some(word => normalized.includes(word));
    const hasPattern = bannedPatterns.some(pattern => pattern.test(lower) || pattern.test(normalized));

    if (!hasBasic && !hasPattern) return;

    let censoredContent = originalContent;
    for (const word of bannedWords) {
        const regex = new RegExp(word, "gi");
        censoredContent = censoredContent.replace(regex, "***");
    }

    await message.delete().catch(() => {});

    await message.channel.send(`💬 **Message censuré de ${message.author}:**\n${censoredContent}`);

    const userId = message.author.id;
    const guild = message.guild;

    const current = warnings.get(userId) || 0;
    const newCount = current + 1;
    warnings.set(userId, newCount);

    try {
        await message.author.send({
            embeds: [
                {
                    title: "⚠️ Avertissement reçu",
                    description: `Ton message dans **${guild.name}** contenait un mot interdit.\n\n**Avertissement : ${newCount} / ${MAX_WARNINGS}**`,
                    color: 0xffa500,
                    fields: [
                        {
                            name: "Message censuré",
                            value: `\`${censoredContent}\``
                        },
                        {
                            name: "Rappel",
                            value: "Merci de rester respectueux pour éviter d'autres avertissements."
                        }
                    ],
                    footer: {
                        text: "Système automatique de modération"
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        });
    } catch (err) {
        console.log("Impossible d'envoyer un DM à l'utilisateur.");
    }

    if (newCount >= MAX_WARNINGS) {
        const logChannel = guild.channels.cache.get(logChannelId);

        try {
            await message.author.send({
                embeds: [
                    {
                        title: "🚫 Action disciplinaire",
                        description: `Tu as atteint **${MAX_WARNINGS} avertissements** sur le serveur **${guild.name}**.`,
                        color: 0xff0000,
                        footer: { text: "Modération automatique" },
                        timestamp: new Date().toISOString()
                    }
                ]
            });
        } catch {}

        try {
            await guild.members.ban(userId, { reason: "Trop d'avertissements automatiques (gros mots)" });
        } catch {
            console.log("Impossible de bannir l'utilisateur.");
        }

        if (logChannel) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`unban_${userId}`)
                    .setLabel("🔓 Débannir")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`invite_${userId}`)
                    .setLabel("✉️ Envoyer une invitation")
                    .setStyle(ButtonStyle.Primary)
            );

            logChannel.send({
                embeds: [
                    {
                        title: "🔨 Sanction appliquée",
                        description: `${message.author} a été banni automatiquement après ${MAX_WARNINGS} avertissements.`,
                        color: 0xff0000,
                        timestamp: new Date().toISOString()
                    }
                ],
                components: [row]
            }).catch(() => {});
        }
    }
});
