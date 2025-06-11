const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

const API_BASE_URL = `http://localhost:${process.env.PORT || 80}`;
const SHEET_NAME = 'シート1';
const TRY_MODELS = ['gemini-1.5-flash'];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 公開APIでのスケジュールデータ操作関数
const scheduleApi = {
    async get() {
        const response = await fetch(`${API_BASE_URL}/api/schedule/public`);
        if (!response.ok) throw new Error(`API response was not ok: ${response.status}`);
        return response.json();
    },

    async add(items) {
        const response = await fetch(`${API_BASE_URL}/api/schedule/public/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        if (!response.ok) throw new Error(`API response was not ok: ${response.status}`);
        return response.json();
    },

    async update(index, item) {
        const response = await fetch(`${API_BASE_URL}/api/schedule/public/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index, item })
        });
        if (!response.ok) throw new Error(`API response was not ok: ${response.status}`);
        return response.json();
    },

    async delete(indices) {
        const response = await fetch(`${API_BASE_URL}/api/schedule/public/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ indices })
        });
        if (!response.ok) throw new Error(`API response was not ok: ${response.status}`);
        return response.json();
    }
};

async function tryModelsForTask(prompt, responseParser, taskName) {
    let lastError = null;
    for (const modelName of TRY_MODELS) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            let jsonToParse = response.text().trim().replace(/^```(json)?|```$/g, '').trim();
            return responseParser(jsonToParse, modelName);
        } catch (error) {
            console.warn(`[${modelName} - ${taskName}] での情報抽出に失敗: ${error.message}`);
            lastError = error;
        }
    }
    console.error(`全てのAIモデルでの情報抽出に失敗しました (${taskName})。`, lastError);
    return null;
}

async function extractScheduleInfoWithAI(userInput) {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    const prompt = `あなたは優秀なスケジュールアシスタントです。ユーザーからの自然な文章を分析し、含まれている全ての予定をJSON形式の配列で抽出してください。\n# 厳守するべきルール\n1.  **出力形式**: 結果は必ずJSON配列 \`[{"type": "種別", "task": "内容", "due": "期限"}, ...]\` の形式で出力してください。説明や前置きは一切不要です。\n2.  **「内容(task)」の抽出**: 「内容(task)」は最も重要な項目です。ユーザー入力から、**何をするのか**を具体的に抜き出してください。もし内容が抽出できなければ、その予定は無効とみなし、結果に含めないでください。\n3.  **「種別(type)」の割り当て**: ユーザー入力に「宿題」「課題」「レポート」「提出」などの言葉があれば「課題」に、 「テスト」「試験」があれば「テスト」に分類してください。それ以外で明確な種別がなければ「その他」としてください。\n4.  **「期限(due)」の正規化**: 期限は必ず「YYYY-MM-DD」形式に変換してください。「今日」は \`${todayStr}\`、「明日」は \`${tomorrowStr}\` です。「来週の月曜日」のような表現も具体的な日付に変換してください。期限が不明または指定されていない場合は \`"未定"\` としてください。\n5.  **複数予定の認識**: 複数の予定が含まれている場合は、それぞれを個別のJSONオブジェクトとして認識してください。\n6.  **該当なしの場合**: 予定として認識できる情報が何もなければ、空の配列 \`[]\` のみを出力してください。\n\n# ユーザー入力\n"${userInput}"`;
    const parsedResult = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'ScheduleAI');
    return Array.isArray(parsedResult) ? parsedResult : [];
}

async function extractDeletionTargetWithAI(userInput, currentSchedules) {
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const todayStr = today.toISOString().slice(0, 10);
    const formattedSchedules = currentSchedules.map((item, index) => ({ index, type: item[0], task: item[1], due: item[2] }));
    const prompt = `あなたはタスク管理アシスタントです。以下の予定リストとユーザーの削除リクエストを照合し、削除対象となる予定のインデックス番号を特定してください。\n# ルール\n1.  ユーザーの入力に最も一致する予定をリストから見つけます。\n2.  結果は \`{"indicesToDelete": [index1, index2, ...], "reason": "AIの判断理由"}\` というJSON形式の文字列のみで出力してください。\n3.  削除対象が特定できない場合は、 \`indicesToDelete\` は空の配列 \`[]\` とし、 \`reason\` にその理由を記述してください。\n4.  今日の日付は \`${todayStr}\` です。\n# 予定リスト\n${JSON.stringify(formattedSchedules, null, 2)}\n# ユーザーの削除リクエスト\n"${userInput}"`;
    const parsedResult = await tryModelsForTask(prompt, (json) => JSON.parse(json), 'DeletionAI');
    return parsedResult || { indicesToDelete: [], reason: "AIモデルでの処理中にエラーが発生しました。" };
}

function createScheduleEmbed(scheduleItem, currentIndex, totalSchedules) {
    const [type, task, dueDate] = scheduleItem;
    return new EmbedBuilder()
        .setTitle(`📝 ${type || 'N/A'} (${currentIndex + 1}/${totalSchedules})`)
        .setColor(0x0099FF)
        .addFields(
            { name: '内容', value: task || 'N/A' },
            { name: '期限', value: dueDate || 'N/A' }
        )
        .setTimestamp()
        .setFooter({ text: `予定 ${currentIndex + 1} / ${totalSchedules}` });
}

function updateScheduleButtons(currentIndex, totalSchedules, schedulesExist) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('schedule_previous')
                .setLabel('前の予定')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentIndex === 0 || !schedulesExist),
            new ButtonBuilder()
                .setCustomId('schedule_next')
                .setLabel('次の予定')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentIndex >= totalSchedules - 1 || !schedulesExist),
            new ButtonBuilder()
                .setCustomId('schedule_add_modal_trigger')
                .setLabel('追加')
                .setStyle(ButtonStyle.Success)
        );

    if (schedulesExist) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('schedule_edit_modal_trigger')
                .setLabel('編集')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('schedule_delete_modal_trigger')
                .setLabel('削除')
                .setStyle(ButtonStyle.Danger)
        );
    }
    return row;
}

async function scheduleDailyReminder(client) {
    const logPrefix = '[定時リマインダー]';
    try {
        const { items: allSchedules, settings } = await scheduleApi.get();
        if (!settings.remindersEnabled || !settings.reminderGuildId || !settings.reminderRoleId) {
            console.log(`${logPrefix} リマインダーは無効か設定が不完全です`);
            return null;
        }

        const tomorrow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().slice(0, 10);

        const cleanedSchedules = allSchedules.map(row => ({
            type: (row[0] || '').trim(),
            task: (row[1] || '').trim(),
            due: (row[2] || '').trim()
        })).filter(s => s.task);

        const homeworkDueTomorrow = cleanedSchedules.filter(s =>
            s.due === tomorrowStr && s.type === '課題'
        );

        if (homeworkDueTomorrow.length === 0) {
            console.log(`${logPrefix} 明日期限の課題はありません`);
            return null;
        }

        const reminderEmbed = new EmbedBuilder()
            .setTitle(`📢 明日提出の宿題リマインダー (${tomorrowStr})`)
            .setColor(0xFFB700)
            .setDescription('以下の宿題が明日提出です。')
            .setTimestamp()
            .addFields(homeworkDueTomorrow.map(({ task, type }) => ({
                name: `📝 ${task}`,
                value: `種別: ${type}`
            })));

        const guild = await client.guilds.fetch(settings.reminderGuildId);
        const role = await guild.roles.fetch(settings.reminderRoleId);
        
        if (!role) {
            console.error(`${logPrefix} 指定されたロールが見つかりません`);
            return null;
        }

        await guild.members.fetch();
        const membersWithRole = role.members;
        let successCount = 0;
        let failureCount = 0;

        for (const member of membersWithRole.values()) {
            if (member.user.bot) continue;
            try {
                await member.send({ embeds: [reminderEmbed] });
                successCount++;
            } catch (dmError) {
                console.warn(`${logPrefix} ⚠️ ${member.user.tag} へのDM送信失敗`);
                failureCount++;
            }
        }

        return { success: successCount, failure: failureCount };

    } catch (error) {
        console.error(`${logPrefix} エラー:`, error);
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('予定を確認・追加・編集・削除します。'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const { items: schedules, settings } = await scheduleApi.get();
            if (!settings.googleSheetId) {
                return interaction.editReply({ content: '❌ スケジュール機能の設定が見つかりません。' });
            }

            let currentIndex = 0;
            const totalSchedules = schedules.length;
            const schedulesExist = totalSchedules > 0;
            const initialEmbed = schedulesExist ? createScheduleEmbed(schedules[currentIndex], currentIndex, totalSchedules) : null;
            const initialRow = updateScheduleButtons(currentIndex, totalSchedules, schedulesExist);
            const replyOptions = { components: [initialRow] };
            
            if (initialEmbed) {
                replyOptions.embeds = [initialEmbed];
            } else {
                replyOptions.content = '✅ 登録されている予定はありません。「追加」ボタンから新しい予定を登録できます。';
            }

            const message = await interaction.editReply(replyOptions);
            const filter = i => i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 300000 });

            collector.on('collect', async i => {
                try {
                    const { items: freshSchedules } = await scheduleApi.get();
                    const currentTotal = freshSchedules.length;
                    const currentExist = currentTotal > 0;

                    if (i.customId === 'schedule_add_modal_trigger') {
                        const modal = new ModalBuilder()
                            .setCustomId('schedule_add_text_modal')
                            .setTitle('新しい予定を文章で追加')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('schedule_text_input')
                                        .setLabel('予定の詳細を文章で入力')
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setRequired(true)
                                )
                            );
                        return await i.showModal(modal);
                    }

                    if (i.customId === 'schedule_edit_modal_trigger') {
                        if (!currentExist || !freshSchedules[currentIndex]) {
                            return await i.reply({ content: '編集対象の予定がありません。', ephemeral: true });
                        }
                        const [type, task, due] = freshSchedules[currentIndex];
                        const modal = new ModalBuilder()
                            .setCustomId(`schedule_edit_modal_submit_${currentIndex}`)
                            .setTitle('予定を編集')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('edit_type_input')
                                        .setLabel('種別')
                                        .setStyle(TextInputStyle.Short)
                                        .setValue(type || '')
                                        .setRequired(false)
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('edit_task_input')
                                        .setLabel('内容')
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setValue(task || '')
                                        .setRequired(true)
                                ),
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('edit_due_input')
                                        .setLabel('期限')
                                        .setStyle(TextInputStyle.Short)
                                        .setValue(due || '')
                                        .setRequired(false)
                                )
                            );
                        return await i.showModal(modal);
                    }

                    if (i.customId === 'schedule_delete_modal_trigger') {
                        const modal = new ModalBuilder()
                            .setCustomId('schedule_delete_text_modal')
                            .setTitle('削除する予定の情報を入力')
                            .addComponents(
                                new ActionRowBuilder().addComponents(
                                    new TextInputBuilder()
                                        .setCustomId('schedule_delete_description_input')
                                        .setLabel('削除したい予定の特徴を教えてください')
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setRequired(true)
                                )
                            );
                        return await i.showModal(modal);
                    }

                    if (i.customId === 'schedule_previous') {
                        if (currentExist) currentIndex = Math.max(0, currentIndex - 1);
                    }
                    if (i.customId === 'schedule_next') {
                        if (currentExist) currentIndex = Math.min(currentTotal - 1, currentIndex + 1);
                    }

                    const newEmbed = currentExist ? createScheduleEmbed(freshSchedules[currentIndex], currentIndex, currentTotal) : null;
                    const newRow = updateScheduleButtons(currentIndex, currentTotal, currentExist);
                    const updateOptions = { components: [newRow] };
                    if (newEmbed) {
                        updateOptions.embeds = [newEmbed];
                        updateOptions.content = null;
                    } else {
                        updateOptions.embeds = [];
                        updateOptions.content = '✅ 登録されている予定はありません。';
                    }
                    await i.update(updateOptions);

                } catch (error) {
                    if (error.code === 'InteractionAlreadyReplied') return;
                    console.error('ボタン操作中のエラー:', error);
                    await i.reply({ content: 'エラーが発生しました。', ephemeral: true });
                }
            });

            collector.on('end', () => {
                const finalRow = updateScheduleButtons(currentIndex, schedules.length, schedules.length > 0);
                finalRow.components.forEach(button => button.setDisabled(true));
                if (message?.editable) message.edit({ components: [finalRow] }).catch(() => {});
            });

        } catch (error) {
            console.error('スケジュールコマンドエラー:', error);
            await interaction.editReply({ content: 'エラーが発生しました。しばらく待ってから再試行してください。' });
        }
    },

    async handleScheduleModalSubmit(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userInput = interaction.fields.getTextInputValue('schedule_text_input');
        const extractedSchedules = await extractScheduleInfoWithAI(userInput);
        
        if (!extractedSchedules || extractedSchedules.length === 0) {
            return interaction.editReply({ content: '❌ AIが予定情報を抽出できませんでした。' });
        }

        const valuesToAppend = extractedSchedules
            .map(({ type, task, due }) => task ? [type || 'その他', task, due || '未定'] : null)
            .filter(Boolean);

        if (valuesToAppend.length === 0) {
            return interaction.editReply({ content: '❌ 有効な予定を作成できませんでした。' });
        }

        try {
            await scheduleApi.add(valuesToAppend);
            await interaction.editReply({ content: `✅ ${valuesToAppend.length}件の予定を追加しました！` });
        } catch (error) {
            console.error('予定追加エラー:', error);
            await interaction.editReply({ content: '❌ 予定の追加中にエラーが発生しました。' });
        }
    },

    async handleScheduleDeleteModal(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const userInput = interaction.fields.getTextInputValue('schedule_delete_description_input');

        try {
            const { items: currentSchedules } = await scheduleApi.get();
            if (currentSchedules.length === 0) {
                return interaction.editReply({ content: 'ℹ️ 削除対象の予定がありません。' });
            }

            const { indicesToDelete, reason } = await extractDeletionTargetWithAI(userInput, currentSchedules);
            if (!indicesToDelete || indicesToDelete.length === 0) {
                return interaction.editReply({ 
                    content: `❌ AIが削除対象を特定できませんでした。\n> **AIの理由:** ${reason || '不明'}` 
                });
            }

            const validSortedIndices = [...new Set(indicesToDelete)]
                .filter(idx => typeof idx === 'number' && idx >= 0 && idx < currentSchedules.length)
                .sort((a, b) => b - a);

            if (validSortedIndices.length === 0) {
                return interaction.editReply({ content: '❌ 有効な削除対象が見つかりませんでした。' });
            }

            await scheduleApi.delete(validSortedIndices);
            await interaction.editReply({ content: `✅ ${validSortedIndices.length}件の予定を削除しました。` });

        } catch (error) {
            console.error('予定削除エラー:', error);
            await interaction.editReply({ content: '❌ 予定の削除中にエラーが発生しました。' });
        }
    },

    async handleScheduleEditModal(interaction, targetIndex) {
        await interaction.deferReply({ ephemeral: true });
        
        const newType = interaction.fields.getTextInputValue('edit_type_input').trim() || 'その他';
        const newTask = interaction.fields.getTextInputValue('edit_task_input').trim();
        const newDueRaw = interaction.fields.getTextInputValue('edit_due_input').trim() || '未定';

        if (!newTask) {
            return interaction.editReply({ content: '❌ 「内容」は必須です。' });
        }

        const extracted = await extractScheduleInfoWithAI(`${newType} ${newTask} ${newDueRaw}`);
        const newDue = (extracted.length > 0 && extracted[0].due) ? extracted[0].due : newDueRaw;

        try {
            await scheduleApi.update(targetIndex, [newType, newTask, newDue]);
            await interaction.editReply({ content: '✅ 予定を更新しました。' });
        } catch (error) {
            console.error('予定更新エラー:', error);
            await interaction.editReply({ content: '❌ 予定の更新中にエラーが発生しました。' });
        }
    },

    scheduleDailyReminder
};