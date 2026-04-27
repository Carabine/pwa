document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    document.getElementById('submit-btn').addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const { data } = await client.post(domain + '/api/v1/auth/login', { email, password });
            setRefreshedTokens(data);
            window.location.href = '../index.html';
        } catch (err) {
            console.error('Login failed:', err);
        }
    });
});
