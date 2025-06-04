// discord.js から必要なビルダーとスタイルをインポート
const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library'); // JWTクライアントをインポート
require('dotenv').config();

// スプレッドシートIDと範囲
// 環境変数 GOOGLE_SHEET_ID が設定されていればそれを使用し、なければデフォルト値を使用
const sheetId = process.env.GOOGLE_SHEET_ID || '16Mf4f4lIyqvzxjx5Nj8zgvXXRyIZjGFtfQlNmjjzKig';
const listRange = 'シート1!A2:C'; // 一覧表示用の範囲
const appendRange = 'シート1!A:A'; // 追記操作の開始セル

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
    const action = interaction.options.getString('action');

    // listアクションの場合、先にdeferReplyで応答を遅延させます。
    // これにより、APIからのデータ取得に時間がかかってもDiscord側でタイムアウトエラーになりにくくなります。
    // ここでは一覧表示をチャンネルの全員に見える通常のメッセージとして defer します。
    // エラー時のみ ephemeral (送信者のみに見える) メッセージにします。
    if (action === 'list') {
      try {
        await interaction.deferReply(); // 通常のdefer (ephemeralではない)
      } catch (deferError) {
        console.error('Failed to defer reply for list action:', deferError);
        return; // deferに失敗したら処理を中断
      }
    }
    // 'add' アクションの場合はモーダルを表示するため、ここでは deferReply しません。

    if (!interaction.inGuild()) {
      const content = 'このコマンドはサーバー内でのみ使用できます。';
      // interaction.deferred は list アクションで deferReply が成功した場合 true
      if (interaction.deferred) { // list アクションで defer 済み
        await interaction.editReply({ content, flags: MessageFlags.Ephemeral }); // エラーなのでephemeral
      } else if (!interaction.replied) { // add アクションなど、まだ応答していない場合
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    let sheets;
    try {
      if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON environmental variable is not set.');
      }
      const serviceAccountCreds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON);

      const jwtClient = new JWT({
        email: serviceAccountCreds.client_email,
        key: serviceAccountCreds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      sheets = google.sheets({ version: 'v4', auth: jwtClient });
    } catch (authError) {
      console.error('Google API Authentication Error:', authError);
      const authErrorMessage = '❌ Google APIへの認証に失敗しました。設定を確認してください。';
      if (interaction.deferred) { // list アクションで defer 済み
        await interaction.editReply({ content: authErrorMessage, flags: MessageFlags.Ephemeral });
      } else if (!interaction.replied) { // add アクションなど
        await interaction.reply({ content: authErrorMessage, flags: MessageFlags.Ephemeral });
      } else {
        // 既に何らかの応答がされている場合 (モーダル表示後など)
        await interaction.followUp({ content: authErrorMessage, flags: MessageFlags.Ephemeral }).catch(e => console.error("FollowUp Error in auth fail:", e));
      }
      return;
    }

    if (action === 'list') {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: listRange,
        });

        const rows = response.data.values;

        if (rows && rows.length) {
          const embed = new EmbedBuilder()
            .setTitle('📅 予定一覧')
            .setColor(0x0099FF) // 好みの色に変更してください
            .setDescription('現在登録されている予定は以下の通りです。')
            .setTimestamp();

          rows.forEach((row, index) => {
            // 各行が [種別, 内容, 期限] の形式であると仮定
            const type = row[0] || 'N/A';    // 種別 (A列)
            const task = row[1] || 'N/A';    // 内容 (B列)
            const dueDate = row[2] || 'N/A'; // 期限 (C列)
            embed.addFields({
              name: `📝 ${type} (No.${index + 1})`, // 各項目に番号を振る
              value: `**内容:** ${task}\n**期限:** ${dueDate}`,
              inline: false // 各項目を縦に並べる
            });
          });
          // deferReply済みなのでeditReply。一覧表示は通常のメッセージとして表示
          await interaction.editReply({ embeds: [embed] });
        } else {
          // データがない場合も通常のメッセージとして表示（エラーではないため）
          await interaction.editReply({ content: 'ℹ️ スプレッドシートに予定が見つかりませんでした。' });
        }
      } catch (error) {
        console.error('Google Sheets API (get) error:', error);
        let errorMessage = '❌ データの取得中にエラーが発生しました。API設定やスプレッドシートの共有設定、範囲を確認してください。';
        // Google APIからの詳細なエラーメッセージがあれば追加することも可能
        if (error.response && error.response.data && error.response.data.error) {
            const googleError = error.response.data.error;
            if (googleError.message) errorMessage += `\n詳細: ${googleError.message}`;
        }
        // エラーなのでephemeralメッセージで表示
        await interaction.editReply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    } else if (action === 'add') {
      const modal = new ModalBuilder()
        .setCustomId('scheduleAddModal')
        .setTitle('新しい予定を追加');

      const typeInput = new TextInputBuilder()
        .setCustomId('typeInput')
        .setLabel('予定の種別 (例: 宿題, 小テスト)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('宿題')
        .setRequired(true);

      const taskInput = new TextInputBuilder()
        .setCustomId('taskInput')
        .setLabel('予定の内容 (例: 数学P.10-15)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('数学P.10-15')
        .setRequired(true);

      const dueInput = new TextInputBuilder()
        .setCustomId('dueInput')
        .setLabel('期限 (例: 2025-06-05)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('YYYY-MM-DD または MM/DD')
        .setMinLength(4) // MM/DDを許容
        .setMaxLength(10) // YYYY-MM-DD
        .setRequired(true);

      // 各 TextInput を ActionRow に追加
      const firstActionRow = new ActionRowBuilder().addComponents(typeInput);
      const secondActionRow = new ActionRowBuilder().addComponents(taskInput);
      const thirdActionRow = new ActionRowBuilder().addComponents(dueInput);

      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

      try {
        await interaction.showModal(modal);
      } catch (showModalError) {
          console.error("Error showing modal:", showModalError);
          // showModalが失敗した場合、通常は元のinteractionにreplyもできない状態になっている可能性が高い
          // (例: Interaction Tokenの期限切れなど)
          // 必要であればログに詳細を記録する
          return;
      }

      let submitted;
      try {
        // awaitModalSubmit は元の interaction オブジェクトから呼び出す
        submitted = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === 'scheduleAddModal' && i.user.id === interaction.user.id,
            time: 300_000 // 5分間 (300,000ミリ秒)
        });

        const type = submitted.fields.getTextInputValue('typeInput');
        const task = submitted.fields.getTextInputValue('taskInput');
        const due = submitted.fields.getTextInputValue('dueInput');

        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: appendRange, // A列から追記
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [[type, task, due]], // 3つの値を配列で渡す
          },
        });

        // モーダル送信成功のメッセージ (ephemeral)
        await submitted.reply({ content: '✅ 予定をスプレッドシートに追加しました！', flags: MessageFlags.Ephemeral });

      } catch (error) {
        // submitted.reply が呼ばれる前のエラー (awaitModalSubmit のタイムアウトなど)
        // または submitted.reply が失敗した後のエラー
        if (error.code === 'InteractionCollectorError' || (error.message && error.message.toLowerCase().includes('time'))) {
          console.log(`Modal (scheduleAddModal) for user ${interaction.user.tag} timed out or was cancelled.`);
          // タイムアウトした場合、ユーザーに通知するなら元の interaction 経由で followUp を試みる
          // (モーダル自体は応答を返さないため、元のインタラクションはまだfollowUp可能)
          if (interaction.channel) { // submitted.replied のチェックはここでは不要な場合が多い
             await interaction.followUp({ content: '⏰ モーダルの入力がタイムアウトしました。再度コマンドを実行してください。', flags: MessageFlags.Ephemeral }).catch(e => console.error("Timeout FollowUp Error:", e));
          }
        } else {
          console.error('Modal submission or Google Sheets API (append) error:', error);
          const appendErrorMessage = '❌ 予定の追加中にエラーが発生しました。入力内容やAPI設定、スプレッドシートの共有設定を確認してください。';
          // submitted.reply が失敗した場合、またはそれ以前のSheets APIエラーの場合
          if (submitted && submitted.isRepliable()) { // submittedが存在し、まだ応答可能な場合
            await submitted.reply({ content: appendErrorMessage, flags: MessageFlags.Ephemeral }).catch(async e => { // submitted.replyも失敗した場合
                console.error("Error replying to submitted modal:", e);
                if (interaction.channel) { // 元のinteractionでfollowUpを試みる
                    await interaction.followUp({ content: appendErrorMessage, flags: MessageFlags.Ephemeral }).catch(fe => console.error("FollowUp Error after submitted.reply failure:", fe));
                }
            });
          } else if (interaction.channel) { // submittedがない、または応答不可の場合
            await interaction.followUp({ content: appendErrorMessage, flags: MessageFlags.Ephemeral }).catch(e => console.error("FollowUp Error in modal processing:", e));
          }
        }
      }
    }
  },
};