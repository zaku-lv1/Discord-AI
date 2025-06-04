const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder, InteractionResponseFlags } = require('discord.js'); // InteractionResponseFlags をインポート
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const sheetId = '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig';
const listRange = 'シート1!A2:C';
const appendRange = 'シート1!A:A';

// Google Sheets APIクライアントを取得する非同期関数
async function getSheetsClient() {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON) {
        console.error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON environmental variable is not set.');
        throw new Error('Google API 認証情報が設定されていません。'); // ユーザー向けのエラーメッセージも考慮
    }
    try {
        const serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON);
        const jwtClient = new JWT({
            email: serviceAccountCreds.client_email,
            key: serviceAccountCreds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        // await jwtClient.authorize(); // 通常、最初のAPIコール時に自動で認証されます
        return google.sheets({ version: 'v4', auth: jwtClient });
    } catch (e) {
        console.error("Error parsing service account credentials or creating JWT client:", e);
        throw new Error('Google API 認証クライアントの作成に失敗しました。');
    }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('宿題や小テストの予定を確認・追加します')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('操作を選択してください')
        .setRequired(true)
        .addChoices(
          { name: '一覧表示', value: 'list' },
          { name: '予定を追加', value: 'add' },
        )
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
        await interaction.reply({ content: 'このコマンドはサーバー内でのみ使用できます。', flags: InteractionResponseFlags.EPHEMERAL });
        return;
    }

    const action = interaction.options.getString('action');

    if (action === 'list') {
      await interaction.deferReply({ flags: InteractionResponseFlags.EPHEMERAL }); // 先に acknowledge (必要に応じてephemeralを解除)
      try {
        const sheets = await getSheetsClient(); // APIコール直前にクライアント取得
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: listRange,
        });

        const rows = response.data.values;

        if (!rows || rows.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('🗓 スケジュール一覧')
            .setDescription('📭 スケジュールは現在空です。');
          await interaction.editReply({ embeds: [emptyEmbed] });
          return;
        }

        rows.sort((a, b) => { /* ...ソート処理... */ });

        const embed = new EmbedBuilder() /* ...Embed作成... */ ;
        // fieldsToShow, embed.addFields, embed.setFooter など
        // ... (元のlistのロジックをここに記述) ...

        // 仮のEmbed表示 (元のロジックに置き換えてください)
        embed.setColor(0x0099FF).setTitle('🗓 現在のスケジュール一覧');
        const fieldsToShow = rows.slice(0, 10);
        fieldsToShow.forEach(([type, task, due]) => {
            embed.addFields({ name: `📌 ${type}「${task}」`, value: `締切: ${due || '未定'}`, inline: false });
        });
        if (rows.length > 10) {
            embed.setFooter({text: `全 ${rows.length} 件中、${fieldsToShow.length} 件を表示しています。`});
        } else if (rows.length === 0) {
             embed.setDescription('データがありません。');
        }


        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        console.error('Error in list action:', error);
        // interaction.editReply は deferReply 後なので、失敗時も editReply を試みる
        await interaction.editReply({ content: '❌ データの処理中にエラーが発生しました。設定や権限を確認してください。' }).catch(e => console.error("EditReply after error failed:", e));
      }
    } else if (action === 'add') {
      // モーダル定義
      const modal = new ModalBuilder()
        .setCustomId('scheduleAddModal')
        .setTitle('新しい予定を追加');
      const typeInput = new TextInputBuilder() /* ... */ .setCustomId('typeInput').setLabel("種別").setStyle(TextInputStyle.Short).setRequired(true);
      const taskInput = new TextInputBuilder() /* ... */ .setCustomId('taskInput').setLabel("内容").setStyle(TextInputStyle.Paragraph).setRequired(true);
      const dueInput = new TextInputBuilder() /* ... */ .setCustomId('dueInput').setLabel("期限 (YYYY-MM-DD)").setStyle(TextInputStyle.Short).setRequired(true);
      const firstActionRow = new ActionRowBuilder().addComponents(typeInput);
      const secondActionRow = new ActionRowBuilder().addComponents(taskInput);
      const thirdActionRow = new ActionRowBuilder().addComponents(dueInput);
      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

      try {
        await interaction.showModal(modal); // モーダル表示を試みる (これは3秒以内に行われるべき)
      } catch (modalError) {
        console.error('Failed to show modal:', modalError);
        // showModalが失敗した場合、ユーザーへのフィードバックは難しいことが多い
        // index.js側のグローバルエラーハンドラに処理が移るか、ここでログのみで終了
        return;
      }

      let submittedInteraction;
      try {
        const filter = (i) => i.customId === 'scheduleAddModal' && i.user.id === interaction.user.id;
        submittedInteraction = await interaction.awaitModalSubmit({ filter, time: 300_000 }); // 5分間のタイムアウト

        // モーダルが送信されたので、ここで acknowledge (deferReply)
        await submittedInteraction.deferReply({ flags: InteractionResponseFlags.EPHEMERAL });

        const type = submittedInteraction.fields.getTextInputValue('typeInput');
        const task = submittedInteraction.fields.getTextInputValue('taskInput');
        const due = submittedInteraction.fields.getTextInputValue('dueInput');

        const sheets = await getSheetsClient(); // APIコール直前にクライアント取得
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: appendRange,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[type, task, due]] },
        });

        await submittedInteraction.editReply({ content: '✅ 予定をスプレッドシートに追加しました！' });

      } catch (error) {
        // error.code === 'InteractionCollectorError' は awaitModalSubmit のタイムアウト
        if (error.name === 'InteractionCollectorError' || (error.code && error.code === 'InteractionCollectorError')) { // discord.js のバージョンによってエラーオブジェクトの形式が若干異なる可能性
          console.log(`Modal (scheduleAddModal) for user ${interaction.user.tag} timed out.`);
          // タイムアウトの場合、submittedInteraction は未定義。ユーザーへの通知はしないか、元のインタラクションに followUp (ただし期限切れの可能性)
          // この時点では submittedInteraction.editReply は呼べない。
          // 元の interaction (スラッシュコマンドの) に followUp する手もあるが、これも3秒ルールや15分ルールに注意
        } else {
          console.error('Modal submission or Google Sheets API (append) error:', error);
          if (submittedInteraction && (submittedInteraction.replied || submittedInteraction.deferred)) {
             await submittedInteraction.editReply({ content: '❌ 予定の追加中にエラーが発生しました。入力内容やAPI設定、権限を確認してください。' }).catch(e => console.error("EditReply after error failed:", e));
          } else if (submittedInteraction && submittedInteraction.isRepliable()){ // 万が一 defer に失敗等していたら
             await submittedInteraction.reply({ content: '❌ 予定の追加中にエラーが発生しました。', flags: InteractionResponseFlags.EPHEMERAL }).catch(e => console.error("Reply after error failed:", e));
          }
          // submittedInteraction がない場合 (例: deferReply 前のエラー) は、元の interaction にフォールバックも検討できるが、状況による
        }
      }
    }
  },
};