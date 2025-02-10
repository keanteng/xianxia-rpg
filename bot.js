// load libraries
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

// setup
const genAI = new GoogleGenerativeAI(process.env.gemini_api_token);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
};

// Store chat history for each channel
const chatHistories = {};

async function generateAndSendContent(prompt, channel) {
    try {
        // Show typing indicator
        await channel.sendTyping();

        // Initialize chat history if it doesn't exist
        if (!chatHistories[channel.id]) {
            chatHistories[channel.id] = [];
        }

        const chatSession = model.startChat({
            generationConfig,
            history: chatHistories[channel.id].map(entry => ({
                role: entry.role,
                parts: entry.parts.map(part => ({
                    text: part.text
                }))
            })),
        });
        const result = await chatSession.sendMessage(prompt);
        const content = result.response.text();

        // Ensure content is a string
        if (typeof content !== 'string') {
            throw new Error('Generated content is not a string');
        }

        // Update chat history
        chatHistories[channel.id].push({ role: 'user', parts: [{ text: prompt }] });
        chatHistories[channel.id].push({ role: 'model', parts: [{ text: content }] });

        // Determine if the response should be sent as a text message or a text file
        if (content.length > 2000) { // Discord message character limit
            const filePath = './response.txt';
            fs.writeFileSync(filePath, content);

            const attachment = new AttachmentBuilder(filePath);
            await channel.send({ files: [attachment] });

            // Clean up the file after sending
            fs.unlinkSync(filePath);
        } else {
            // Send the content to the Discord channel
            if (channel) {
                await channel.send(content);
            } else {
                console.error("Channel not found");
            }
        }
    } catch (error) {
        console.error("Error generating content:", error);
    }
}

// login to Discord and set up message listener
client.once('ready', () => {
    console.log('Discord client ready');
});

client.on('messageCreate', async (message) => {
    // Ignore messages from the bot itself
    if (message.author.bot) return;

    let prompt = message.content;

    // Check if the message contains attachments
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        console.log(`Received attachment: ${attachment.url}`);

        try {
            const response = await axios.get(attachment.url);
            prompt = response.data;
        } catch (error) {
            console.error("Error reading attachment:", error);
            return;
        }
    }

    // Check if the message content is empty
    if (!prompt) {
        console.error("Received an empty message");
        return;
    }

    // Generate and send response
    await generateAndSendContent(prompt, message.channel);

    // check history
    console.log(chatHistories);
});

client.login(process.env.DISCORD_BOT_TOKEN);