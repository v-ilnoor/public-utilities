const API_BASE = '/api';

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    updateCurrentDate();
    loadTariffs();
    loadPaymentHistory();
    setupTabNavigation();
    
    // Устанавливаем текущий месяц по умолчанию
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    document.getElementById('period').value = `${year}-${month}`;
});

function updateCurrentDate() {
    const now = new Date();
    const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
    };
    document.getElementById('currentDate').textContent = 
        now.toLocaleDateString('ru-RU', options);
}

function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Убираем активный класс у всех кнопок и контента
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Добавляем активный класс текущим элементам
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            // Загружаем данные для активной вкладки
            if (targetTab === 'tariffs') {
                loadTariffs();
            } else if (targetTab === 'history') {
                loadPaymentHistory();
            }
        });
    });
}

async function loadTariffs() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/tariffs`);
        const tariffs = await response.json();
        
        displayCurrentTariffs(tariffs);
        populateTariffForm(tariffs);
    } catch (error) {
        showError('Ошибка загрузки тарифов: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayCurrentTariffs(tariffs) {
    const container = document.getElementById('currentTariffs');
    container.innerHTML = `
        <div class="tariff-item">
            <div class="service">Отопление</div>
            <div class="rate">${tariffs.heating} руб/м²</div>
        </div>
        <div class="tariff-item">
            <div class="service">Холодная вода</div>
            <div class="rate">${tariffs.cold_water} руб/м³</div>
        </div>
        <div class="tariff-item">
            <div class="service">Горячая вода</div>
            <div class="rate">${tariffs.hot_water} руб/м³</div>
        </div>
        <div class="tariff-item">
            <div class="service">Электричество</div>
            <div class="rate">${tariffs.electricity} руб/кВт·ч</div>
        </div>
        <div class="tariff-item">
            <div class="service">Содержание</div>
            <div class="rate">${tariffs.maintenance} руб/м²</div>
        </div>
    `;
}

function populateTariffForm(tariffs) {
    document.getElementById('heating').value = tariffs.heating;
    document.getElementById('coldWaterTariff').value = tariffs.cold_water;
    document.getElementById('hotWaterTariff').value = tariffs.hot_water;
    document.getElementById('electricityTariff').value = tariffs.electricity;
    document.getElementById('maintenance').value = tariffs.maintenance;
}

async function updateTariffs() {
    try {
        const newTariffs = {
            heating: parseFloat(document.getElementById('heating').value),
            cold_water: parseFloat(document.getElementById('coldWaterTariff').value),
            hot_water: parseFloat(document.getElementById('hotWaterTariff').value),
            electricity: parseFloat(document.getElementById('electricityTariff').value),
            maintenance: parseFloat(document.getElementById('maintenance').value)
        };

        const response = await fetch(`${API_BASE}/tariffs`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newTariffs)
        });

        if (response.ok) {
            showSuccess('Тарифы успешно обновлены!');
            loadTariffs();
        } else {
            throw new Error('Ошибка обновления тарифов');
        }
    } catch (error) {
        showError('Ошибка обновления тарифов: ' + error.message);
    }
}

async function getPreviousReadings() {
    const apartmentNumber = document.getElementById('apartmentNumber').value;
    if (!apartmentNumber) {
        showError('Введите номер квартиры');
        return;
    }

    try {
        showLoading();
        const response = await fetch(`${API_BASE}/readings/${apartmentNumber}`);
        const data = await response.json();
        
        if (data.readings) {
            document.getElementById('coldWater').value = data.readings.cold_water;
            document.getElementById('hotWater').value = data.readings.hot_water;
            document.getElementById('electricity').value = data.readings.electricity;
            showSuccess('Предыдущие показания загружены');
        }
    } catch (error) {
        showError('Ошибка загрузки показаний: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function calculatePayment() {
    if (!validateCalculationForm()) return;

    try {
        showLoading();
        const requestData = getCalculationRequestData();

        const response = await fetch(`${API_BASE}/calculate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Ошибка расчета');
        }

        const result = await response.json();
        displayCalculationResult(result);
    } catch (error) {
        showError('Ошибка расчета: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function savePayment() {
    if (!validateCalculationForm()) return;

    try {
        showLoading();
        const requestData = getCalculationRequestData();

        const response = await fetch(`${API_BASE}/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (response.ok) {
            showSuccess('Расчет сохранен в историю!');
            loadPaymentHistory();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Ошибка сохранения');
        }
    } catch (error) {
        showError('Ошибка сохранения: ' + error.message);
    } finally {
        hideLoading();
    }
}

function getCalculationRequestData() {
    return {
        apartment: {
            number: document.getElementById('apartmentNumber').value,
            owner: document.getElementById('owner').value,
            area: parseFloat(document.getElementById('area').value),
            residents: parseInt(document.getElementById('residents').value)
        },
        readings: {
            cold_water: parseInt(document.getElementById('coldWater').value),
            hot_water: parseInt(document.getElementById('hotWater').value),
            electricity: parseInt(document.getElementById('electricity').value)
        },
        period: document.getElementById('period').value
    };
}

function validateCalculationForm() {
    const requiredFields = [
        'apartmentNumber', 'owner', 'area', 'residents',
        'period', 'coldWater', 'hotWater', 'electricity'
    ];

    for (const fieldId of requiredFields) {
        const field = document.getElementById(fieldId);
        if (!field.value) {
            showError(`Заполните поле: ${field.previousElementSibling.textContent}`);
            field.focus();
            return false;
        }
    }

    if (parseFloat(document.getElementById('area').value) <= 0) {
        showError('Площадь должна быть положительной');
        return false;
    }

    if (parseInt(document.getElementById('residents').value) <= 0) {
        showError('Количество жильцов должно быть положительным');
        return false;
    }

    return true;
}

function displayCalculationResult(result) {
    const calculation = result.calculation;
    const container = document.getElementById('resultDetails');
    
    container.innerHTML = `
        <div class="result-item">
            <div class="label">Отопление</div>
            <div class="value">${calculation.heating} руб</div>
        </div>
        <div class="result-item">
            <div class="label">Холодная вода</div>
            <div class="value">${calculation.cold_water} м³ × ${result.calculation.cold_water_amount / calculation.cold_water || 0} руб = ${calculation.cold_water_amount} руб</div>
        </div>
        <div class="result-item">
            <div class="label">Горячая вода</div>
            <div class="value">${calculation.hot_water} м³ × ${result.calculation.hot_water_amount / calculation.hot_water || 0} руб = ${calculation.hot_water_amount} руб</div>
        </div>
        <div class="result-item">
            <div class="label">Электричество</div>
            <div class="value">${calculation.electricity} кВт·ч × ${result.calculation.electricity_amount / calculation.electricity || 0} руб = ${calculation.electricity_amount} руб</div>
        </div>
        <div class="result-item">
            <div class="label">Содержание</div>
            <div class="value">${calculation.maintenance} руб</div>
        </div>
        <div class="result-item total">
            <div class="label">ИТОГО</div>
            <div class="value">${calculation.total} руб</div>
        </div>
    `;

    document.getElementById('calculationResult').style.display = 'block';
}

async function loadPaymentHistory() {
    try {
        showLoading();
        const searchApartment = document.getElementById('searchApartment').value;
        const url = searchApartment ? 
            `${API_BASE}/payments?apartment_number=${searchApartment}` : 
            `${API_BASE}/payments`;

        const response = await fetch(url);
        const history = await response.json();

        displayPaymentHistory(history);
    } catch (error) {
        showError('Ошибка загрузки истории: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayPaymentHistory(history) {
    const container = document.getElementById('paymentHistory');
    
    if (history.length === 0) {
        container.innerHTML = '<p class="no-data">История платежей пуста</p>';
        return;
    }

    container.innerHTML = history.map(payment => `
        <div class="payment-card ${payment.is_paid ? 'paid' : ''}">
            <div class="payment-header">
                <h4>Квартира №${payment.apartment.number} - ${payment.period}</h4>
                <span class="${payment.is_paid ? 'status-paid' : 'status-unpaid'}">
                    ${payment.is_paid ? 'ОПЛАЧЕНО' : 'НЕ ОПЛАЧЕНО'}
                </span>
            </div>
            <div class="payment-info">
                <div><strong>Собственник:</strong> ${payment.apartment.owner}</div>
                <div><strong>Площадь:</strong> ${payment.apartment.area} м²</div>
                <div><strong>Жильцов:</strong> ${payment.apartment.residents}</div>
                <div><strong>Сумма:</strong> ${payment.total_amount} руб</div>
            </div>
            <div class="payment-actions">
                <button onclick="togglePaymentStatus('${payment.id}', ${!payment.is_paid})">
                    ${payment.is_paid ? '❌ Отметить как неоплаченное' : '✅ Отметить как оплаченное'}
                </button>
                <button onclick="deletePaymentRecord('${payment.id}')" class="danger">
                    🗑️ Удалить
                </button>
            </div>
        </div>
    `).join('');
}

async function togglePaymentStatus(paymentId, newStatus) {
    try {
        const response = await fetch(`${API_BASE}/payments/${paymentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ is_paid: newStatus })
        });

        if (response.ok) {
            showSuccess('Статус оплаты обновлен!');
            loadPaymentHistory();
        } else {
            throw new Error('Ошибка обновления статуса');
        }
    } catch (error) {
        showError('Ошибка обновления статуса: ' + error.message);
    }
}

async function deletePaymentRecord(paymentId) {
    if (!confirm('Вы уверены, что хотите удалить эту запись?')) return;

    try {
        const response = await fetch(`${API_BASE}/payments/${paymentId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showSuccess('Запись удалена!');
            loadPaymentHistory();
        } else {
            throw new Error('Ошибка удаления записи');
        }
    } catch (error) {
        showError('Ошибка удаления записи: ' + error.message);
    }
}

// Вспомогательные функции
function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showError(message) {
    alert('❌ ' + message);
}

function showSuccess(message) {
    alert('✅ ' + message);
}

// Поиск при изменении поля фильтра
document.getElementById('searchApartment').addEventListener('input', debounce(loadPaymentHistory, 500));

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}