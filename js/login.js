window.addEventListener('DOMContentLoaded', function (evt) {
    checkAuth()
    document.querySelector('#submit-btn')?.addEventListener('click', async () => {
        console.log( document.querySelector('#email'))
        const email = document.querySelector('#email').value
        const password = document.querySelector('#password').value
        const {data} = await client.post(domain + '/api/v1/auth/login', {email, password})
        console.log(data)
        // const data = await fetch('http://localhost:3005/api/v1/auth/register', {
        //     method: 'POST',
        //     body: JSON.stringify({email, password}),
        //     headers: {
        //         "Content-Type": "application/json",
        //     }
        // })
        setRefreshedTokens(data)
    })
})
