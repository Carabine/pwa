const loadWords = async () => {
    const wordsListEl = document.querySelector('.words-list');
    wordsListEl.innerHTML = 'Loading...'

    const res = await fetch('./../data2.json')
    const data = await res.json()

   // const { data: { data } } = await client.get(`${domain}/words`)

    wordsListEl.innerHTML = ''

    for(const wordData of data) {
        const wordEl = document.createElement("div")

        wordEl.innerHTML = `
           <div class="word-read-content border rounded-3 mt-2 p-2 position-relative flex flex-col">
             <div id="delete-btn" class="position-absolute top-0 end-0 mt-2 mr-2 text-danger cursor-pointer">X</div>
             <p>Word: ${wordData.kanji}</p>
             <p>Meaning: ${wordData.translation}</p>
             <p>Sentence: ${wordData.sentence}</p>
             <div class="flex justify-content-end">
               <button type="button" class="btn btn-primary ml-auto edit-btn" style="width: 100px">Edit</button>
             </div>                    
           </div>
           <div class="word-edit-content hidden border rounded-3 mt-2 p-2 position-relative flex flex-col">
            <div id="delete-btn" class="position-absolute top-0 end-0 mt-2 mr-2 text-danger cursor-pointer">X</div>
            <div class="form-group">
              <label for="kanji">Word</label>
              <input type="text" id="kanji" class="form-control" style="height: 30px" placeholder="Word" value="${wordData.kanji}">
            </div>
            <div class="form-group">
              <label for="kana">Reading</label>
              <input type="text" id="kana" class="form-control" style="height: 30px" placeholder="Reading" value="${wordData.kana}">
            </div>
            <div class="form-group">
              <label for="translation">Meaning</label>
              <input type="text" id="translation" class="form-control" style="height: 30px" placeholder="Meaning" value="${wordData.translation}">
            </div>
            <div class="form-group">
              <label for="sentence">Sentence</label>
              <input type="text" id="sentence" class="form-control" style="height: 30px" placeholder="Sentence" value="${wordData.sentence}">
            </div>
            <div class="form-group">
              <label for="sentenceTranslation">Sentence translation</label>
              <input type="text" id="sentenceTranslation" class="form-control" style="height: 30px" placeholder="Sentence translation" value="${wordData.sentenceTranslation}">
            </div>
            <div class="form-group">
              <label for="hint">Hint</label>
               <textarea class="form-control" id="hint" placeholder="Hint">${wordData.hint}</textarea>            
            </div>

            <div class="flex justify-content-end mt-2 gap-2">
              <button type="button" class="btn btn-danger ml-auto cancel-btn" style="width: 100px">Cancel</button>
              <button type="button" class="btn btn-success ml-auto save-btn" style="width: 100px">Save</button>
            </div>
          </div>
        `

        wordEl.querySelector("#delete-btn")?.addEventListener('click', async () => {
            await client.delete(domain + '/words/' + wordData.id)
            loadWords()
        })

        wordEl.querySelector(".edit-btn")?.addEventListener('click', async () => {
            wordEl.querySelector(".word-edit-content").classList.remove('hidden')
            wordEl.querySelector(".word-read-content").classList.add('hidden')
        })

        wordEl.querySelector(".cancel-btn")?.addEventListener('click', async () => {
            wordEl.querySelector(".word-edit-content").classList.add('hidden')
            wordEl.querySelector(".word-read-content").classList.remove('hidden')
        })

        wordEl.querySelector(".save-btn")?.addEventListener('click', async () => {
            await client.patch(domain + '/words/' + wordData.id, {
                kanji: wordEl.querySelector("#kanji")?.value ?? '',
                kana: wordEl.querySelector("#kana")?.value ?? '',
                translation: wordEl.querySelector("#translation")?.value ?? '',
                sentence: wordEl.querySelector("#sentence")?.value ?? '',
                sentenceTranslation: wordEl.querySelector("#sentence-translation")?.value ?? '',
                hint: wordEl.querySelector("#hint")?.value ?? ''
            })
            loadWords()
            showSnackbar('Success', {
                duration: 4000,
                type: 'success'
            });
        })

        wordsListEl.append(wordEl)
    }
}

window.addEventListener('DOMContentLoaded', async function (evt) {
    loadWords()
});