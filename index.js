const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField
} = require("discord.js");

//  ANTI‑CRASH
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
// BOT READY
// -----------------------------

client.on("ready", async () => {
    console.log(`Bot connecté en tant que ${client.user.tag}`);

    // Message de réaction 👍
    const channel = await client.channels.fetch(channelId);
    const msg = await channel.send(
        "Bienvenue sur le serveur. Pour confirmer votre arrivée et obtenir votre rôle d’accès, veuillez cliquer sur l’emoji 👍 ci‑dessous."
    );
    await msg.react(emoji);

    // Bouton d'ouverture de ticket
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
// SYSTÈME DE TICKETS
// -----------------------------

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    // --- OUVERTURE DU TICKET ---
    if (interaction.customId === "open_ticket") {
        const userId = interaction.user.id;
        const now = Date.now();

        // Vérification du cooldown
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

        // Mise à jour du cooldown
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

        // 🔔 NOTIFICATION PRIVÉE À L’ADMIN
        const adminUser = await client.users.fetch(adminId);
        adminUser.send(`${interaction.user.username} a ouvert un ticket.`);

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
    if (interaction.customId === "close_ticket") {
        await interaction.channel.delete();
    }
});
