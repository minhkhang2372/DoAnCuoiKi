async function loadComponent(url, containerId) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        document.getElementById(containerId).innerHTML = await response.text();
    } catch (error) {
        console.error(`Error loading ${url}:`, error);
    }
}

async function handleNewsletterSubmit(email) {
    try {
        const response = await fetch('/api/newsletter/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();
        alert(data.message);
        return response.ok;
    } catch (error) {
        alert('Đã có lỗi xảy ra, vui lòng thử lại sau.');
        return false;
    }
}

function initNewsletterForm() {
    const submitButton = document.getElementById('newsletterSubmit');
    const emailInput = document.getElementById('newsletterEmail');

    if (submitButton && emailInput) {
        submitButton.addEventListener('click', async () => {
            if (!emailInput.value || !emailInput.checkValidity()) {
                alert('Vui lòng nhập email hợp lệ');
                return;
            }

            if (await handleNewsletterSubmit(emailInput.value)) {
                emailInput.value = '';
            }
        });
    }
}

function checkLoginStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    const userLoggedIn = document.getElementById('userLoggedIn');
    const userNotLoggedIn = document.getElementById('userNotLoggedIn');
    const welcomeUsername = document.getElementById('welcomeUsername');

    if (token && username) {
        userLoggedIn.style.display = 'block';
        userNotLoggedIn.style.display = 'none';
        welcomeUsername.textContent = `Xin chào ${username}`;
    } else {
        userLoggedIn.style.display = 'none';
        userNotLoggedIn.style.display = 'block';
    }
}

function setupLogoutHandler() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            checkLoginStatus();
            window.location.reload();
        });
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    await loadComponent('/components/header.html', 'header-container');
    await loadComponent('/components/footer.html', 'footer-container');
    
    initNewsletterForm();
    checkLoginStatus();
    setupLogoutHandler();
});