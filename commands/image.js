const { SlashCommandBuilder } = require('discord.js');
const crypto = require('node:crypto');
const { FieldValue } = require('firebase-admin/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('画像をアップロードし、共有用のURLを生成します。')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('URLを生成したい画像ファイル')
                .setRequired(true)
        ),

    /**
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(interaction) {
        const db = interaction.client.db;
        const baseUrl = process.env.BASE_URL;

        if (!baseUrl) {
            console.error('[エラー] 環境変数 BASE_URL が設定されていません。');
            return interaction.reply({ content: '設定エラーにより、URLを生成できませんでした。管理者に連絡してください。', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const attachment = interaction.options.getAttachment('image');

        if (!attachment.contentType?.startsWith('image/')) {
            return interaction.editReply({ content: '画像ファイルのみアップロードできます。' });
        }

        const randomCode = crypto.randomBytes(16).toString('hex');

        try {
            const docRef = db.collection('images').doc(randomCode);
            await docRef.set({
                url: attachment.url,
                contentType: attachment.contentType,
                uploaderId: interaction.user.id,
                uploaderTag: interaction.user.tag,
                guildId: interaction.guildId,
                createdAt: FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('[Firestoreエラー] データ保存に失敗:', error);
            return interaction.editReply({ content: 'データベースエラーによりURLを生成できませんでした。' });
        }

        const generatedUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}${randomCode}`;
        await interaction.editReply({
            content: `✅ 画像のURLを生成しました！\n\n**URL:** ${generatedUrl}`
        });

        console.log(`[情報] 画像URL生成 (Firestore保存): ${generatedUrl}`);
    },
};