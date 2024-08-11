const { Client, GatewayIntentBits } = require("discord.js");
const { token } = require("./config.json");
const fs = require("fs");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

// Load or initialize player data
let players = {};
try {
    players = JSON.parse(fs.readFileSync("players.json", "utf8"));
} catch (err) {
    players = {};
}

// Save player data to file
function savePlayers() {
    fs.writeFileSync("players.json", JSON.stringify(players, null, 2));
}

// Initialize a player with base ELO if they don't exist
function initPlayer(name) {
    if (!players[name]) {
        players[name] = { elo: 1400 };
    }
}

// Calculate new ELO ratings
function calculateElo(winnerElo, loserElo) {
    const k = 32;
    const expectedScoreWinner = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
    const newWinnerElo = winnerElo + k * (1 - expectedScoreWinner);
    const newLoserElo = loserElo + k * (0 - expectedScoreWinner);
    return [Math.round(newWinnerElo), Math.round(newLoserElo)];
}

// Function to shuffle and create balanced teams
function createBalancedTeams(playerNames) {
    playerNames.sort(() => Math.random() - 0.5);
    const half = Math.ceil(playerNames.length / 2);
    const team1 = playerNames.slice(0, half);
    const team2 = playerNames.slice(half);

    const team1Elo = team1.reduce((total, name) => total + players[name].elo, 0);
    const team2Elo = team2.reduce((total, name) => total + players[name].elo, 0);

    return { team1, team2, team1Elo, team2Elo };
}

// Handle commands
client.on("messageCreate", async (message) => {
    if (message.content.startsWith("!game")) {
        const playerMentions = message.mentions.users.map(user => user.username);
        if (playerMentions.length < 2) {
            message.channel.send("Please mention at least 2 players for the game.");
            return;
        }

        // Initialize players
        playerMentions.forEach(initPlayer);

        // Function to send a game message with reactions
        async function sendGameMessage() {
            let { team1, team2, team1Elo, team2Elo } = createBalancedTeams(playerMentions);
            const team1Display = team1.map(name => `${name} (${players[name].elo})`).join(", ");
            const team2Display = team2.map(name => `${name} (${players[name].elo})`).join(", ");

            const gameMessage = await message.channel.send(
                `Team 1 (Total ELO: ${team1Elo}): ${team1Display}\n` +
                `Team 2 (Total ELO: ${team2Elo}): ${team2Display}`
            );

            await gameMessage.react("✅");
            await gameMessage.react("❎");
            await gameMessage.react("🔄");

            const filter = (reaction, user) => ["✅", "❎", "🔄"].includes(reaction.emoji.name) && !user.bot;
            const collector = gameMessage.createReactionCollector({ filter, max: 1, time: 60000 });

            collector.on("collect", async (reaction) => {
                if (reaction.emoji.name === "✅") {
                    const confirmMessage = await message.channel.send(
                        `Game starting!\n` +
                        `Team 1 (Total ELO: ${team1Elo}): ${team1Display}\n` +
                        `Team 2 (Total ELO: ${team2Elo}): ${team2Display}`
                    );
                    await confirmMessage.react("1️⃣");
                    await confirmMessage.react("2️⃣");

                    const gameResultFilter = (reaction, user) => ["1️⃣", "2️⃣"].includes(reaction.emoji.name) && !user.bot;
                    const gameResultCollector = confirmMessage.createReactionCollector({ filter: gameResultFilter, max: 1, time: 60000 });

                    gameResultCollector.on("collect", (reaction) => {
                        if (reaction.emoji.name === "1️⃣") {
                            team1.forEach(winner => {
                                team2.forEach(loser => {
                                    [players[winner].elo, players[loser].elo] = calculateElo(players[winner].elo, players[loser].elo);
                                });
                            });
                            message.channel.send("Team 1 won! ELO updated.");
                        } else if (reaction.emoji.name === "2️⃣") {
                            team2.forEach(winner => {
                                team1.forEach(loser => {
                                    [players[winner].elo, players[loser].elo] = calculateElo(players[winner].elo, players[loser].elo);
                                });
                            });
                            message.channel.send("Team 2 won! ELO updated.");
                        }
                        savePlayers();
                    });

                } else if (reaction.emoji.name === "❎") {
                    message.channel.send("Game cancelled.");

                } else if (reaction.emoji.name === "🔄") {
                    await sendGameMessage(); // Recursively call the function to create new teams and add reactions
                }
            });
        }

        // Call the function to send the initial game message
        await sendGameMessage();
    }

    // Handle !elo command
    else if (message.content.startsWith("!elo")) {
        const user = message.mentions.users.first();
        if (user) {
            initPlayer(user.username);
            message.channel.send(`${user.username} (${players[user.username].elo})`);
        } else {
            message.channel.send("Please mention a user to check their ELO.");
        }
    }

    // Handle !resetelo command
    else if (message.content.startsWith("!resetelo")) {
        const user = message.mentions.users.first();
        if (user) {
            initPlayer(user.username);
            players[user.username].elo = 1400;
            savePlayers();
            message.channel.send(`${user.username}'s ELO has been reset to 1400.`);
        } else {
            // Reset all players' ELO
            Object.keys(players).forEach(name => {
                players[name].elo = 1400;
            });
            savePlayers();
            message.channel.send("All players' ELO has been reset to 1400.");
        }
    }
});

// Log in to Discord
client.login(token);
