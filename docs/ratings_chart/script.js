document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('ratingsChart').getContext('2d');
    const ratingsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
            datasets: [{
                label: 'Количество оценок',
                data: [0, 0, 0, 1, 25, 53, 48, 20, 2, 0],
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Рейтинговые оценки (Всего: 149)'
                }
            }
        }
    });
});
