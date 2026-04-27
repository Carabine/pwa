async function loadWords() {
    const wordsListEl = document.querySelector('.words-list');
    wordsListEl.innerHTML = '<p style="color: var(--text-muted)">Loading...</p>';

    const data = await fetchAndDecode(dataPath('data2.json'));
    wordsListEl.innerHTML = '';

    for (const wordData of data.data) {
        const wordEl = document.createElement('div');

        wordEl.innerHTML = `
            <div class="word-card word-read-content">
                <button class="word-card__delete" title="Delete">&times;</button>
                <div class="word-card__kanji">${wordData.kanji ?? ''}</div>
                <div class="word-card__meaning">${wordData.translation ?? ''}</div>
                <div class="word-card__sentence">${wordData.sentence ?? ''}</div>
                <div class="word-card__actions">
                    <button class="btn btn--ghost edit-btn">Edit</button>
                </div>
            </div>
            <div class="word-card word-edit-content hidden">
                <div class="word-edit">
                    <div class="form-group">
                        <label>Word</label>
                        <input type="text" class="edit-kanji" value="${wordData.kanji ?? ''}">
                    </div>
                    <div class="form-group">
                        <label>Reading</label>
                        <input type="text" class="edit-kana" value="${wordData.kana ?? ''}">
                    </div>
                    <div class="form-group">
                        <label>Meaning</label>
                        <input type="text" class="edit-translation" value="${wordData.translation ?? ''}">
                    </div>
                    <div class="form-group">
                        <label>Sentence</label>
                        <input type="text" class="edit-sentence" value="${wordData.sentence ?? ''}">
                    </div>
                    <div class="form-group">
                        <label>Sentence Translation</label>
                        <input type="text" class="edit-sentenceTranslation" value="${wordData.sentenceTranslation ?? ''}">
                    </div>
                    <div class="form-group">
                        <label>Hint</label>
                        <textarea class="edit-hint">${wordData.hint ?? ''}</textarea>
                    </div>
                    <div class="word-edit__actions">
                        <button class="btn btn--danger cancel-btn">Cancel</button>
                        <button class="btn btn--success save-btn">Save</button>
                    </div>
                </div>
            </div>
        `;

        wordEl.querySelector('.word-card__delete').addEventListener('click', async () => {
            await client.delete(domain + '/words/' + wordData.id);
            loadWords();
        });

        wordEl.querySelector('.edit-btn').addEventListener('click', () => {
            wordEl.querySelector('.word-edit-content').classList.remove('hidden');
            wordEl.querySelector('.word-read-content').classList.add('hidden');
        });

        wordEl.querySelector('.cancel-btn').addEventListener('click', () => {
            wordEl.querySelector('.word-edit-content').classList.add('hidden');
            wordEl.querySelector('.word-read-content').classList.remove('hidden');
        });

        wordEl.querySelector('.save-btn').addEventListener('click', async () => {
            await client.patch(domain + '/words/' + wordData.id, {
                kanji: wordEl.querySelector('.edit-kanji').value,
                kana: wordEl.querySelector('.edit-kana').value,
                translation: wordEl.querySelector('.edit-translation').value,
                sentence: wordEl.querySelector('.edit-sentence').value,
                sentenceTranslation: wordEl.querySelector('.edit-sentenceTranslation').value,
                hint: wordEl.querySelector('.edit-hint').value
            });
            loadWords();
            showSnackbar('Saved successfully', { duration: 3000, type: 'success' });
        });

        wordsListEl.appendChild(wordEl);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    loadWords();
});
