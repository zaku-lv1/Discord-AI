const { SlashCommandBuilder } = require('discord.js');
const { nanoid } = require('nanoid');
const { FieldValue } = require('firebase-admin/firestore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('画像をアップロードし、共有用のURLを生成します。')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('URLを生成したい画像ファイル')
                .setRequired(true)),
    async execute(interaction) {
        const db = interaction.client.db;
        
        let fullBaseUrl = process.env.BASE_URL;
        if (!fullBaseUrl) {
            return interaction.reply({ content: '設定エラー: BASE_URLが未設定です。', ephemeral: true });
        }
        fullBaseUrl = fullBaseUrl.replace(/\/+$/, '');

        await interaction.deferReply({ ephemeral: true });

        const attachment = interaction.options.getAttachment('image');
        if (!attachment.contentType?.startsWith('image/')) {
            return interaction.editReply({ content: '画像ファイルのみアップロードできます。' });
        }
        
        const randomCode = nanoid(8);

        try {
            await db.collection('images').doc(randomCode).set({
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

        const generatedUrl = `${fullBaseUrl}/${randomCode}`;
        
        await interaction.editReply({
            content: `✅ 画像のURLを生成しました！\n\n**URL:** ${generatedUrl}`
        });
    },
};