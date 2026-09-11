from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime, date
import uuid
import json
from enum import Enum

app = FastAPI(title="АИС Расчет кварплаты", version="1.0.0")

# Монтируем статические файлы
app.mount("/static", StaticFiles(directory="static"), name="static")

# ==================== МОДЕЛИ ДАННЫХ ====================
class TariffBase(BaseModel):
    heating: float          # руб/м²
    cold_water: float       # руб/м³
    hot_water: float        # руб/м³
    electricity: float      # руб/кВт·ч
    maintenance: float      # руб/м²

class ApartmentData(BaseModel):
    number: str             # номер квартиры
    owner: str              # собственник
    area: float             # площадь м²
    residents: int          # количество жильцов

class MeterReadings(BaseModel):
    cold_water: int         # текущие показания холодной воды
    hot_water: int          # текущие показания горячей воды
    electricity: int        # текущие показания электричества

class CalculationRequest(BaseModel):
    apartment: ApartmentData
    readings: MeterReadings
    period: str             # период в формате "YYYY-MM"

class PaymentRecord(BaseModel):
    id: str
    period: str
    apartment: ApartmentData
    readings: MeterReadings
    calculation: Dict
    total_amount: float
    is_paid: bool
    created_at: str

class PaymentUpdate(BaseModel):
    is_paid: bool

# ==================== БАЗА ДАННЫХ В ПАМЯТИ ====================
class Database:
    def __init__(self):
        self.tariffs: TariffBase = TariffBase(
            heating=45.60,
            cold_water=40.50,
            hot_water=180.20,
            electricity=5.20,
            maintenance=25.00
        )
        self.payment_history: List[PaymentRecord] = []
        self.previous_readings: Dict[str, MeterReadings] = {}  # ключ: номер_квартиры

db = Database()

# ==================== ФУНКЦИИ РАСЧЕТА ====================
def calculate_payment(apartment: ApartmentData, readings: MeterReadings, tariffs: TariffBase) -> Dict:
    """Расчет квартплаты для одной квартиры"""
    
    # Получаем предыдущие показания
    prev = db.previous_readings.get(apartment.number, MeterReadings(
        cold_water=0, hot_water=0, electricity=0
    ))
    
    # Расчет потребления
    cold_water_consumption = max(0, readings.cold_water - prev.cold_water)
    hot_water_consumption = max(0, readings.hot_water - prev.hot_water)
    electricity_consumption = max(0, readings.electricity - prev.electricity)
    
    # Расчет сумм
    heating_amount = apartment.area * tariffs.heating
    cold_water_amount = cold_water_consumption * tariffs.cold_water
    hot_water_amount = hot_water_consumption * tariffs.hot_water
    electricity_amount = electricity_consumption * tariffs.electricity
    maintenance_amount = apartment.area * tariffs.maintenance
    
    total = heating_amount + cold_water_amount + hot_water_amount + electricity_amount + maintenance_amount
    
    return {
        "heating": round(heating_amount, 2),
        "cold_water": round(cold_water_consumption, 2),
        "cold_water_amount": round(cold_water_amount, 2),
        "hot_water": round(hot_water_consumption, 2),
        "hot_water_amount": round(hot_water_amount, 2),
        "electricity": round(electricity_consumption, 2),
        "electricity_amount": round(electricity_amount, 2),
        "maintenance": round(maintenance_amount, 2),
        "total": round(total, 2),
        "consumption": {
            "cold_water": cold_water_consumption,
            "hot_water": hot_water_consumption,
            "electricity": electricity_consumption
        }
    }

# ==================== API ENDPOINTS ====================

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Главная страница с фронтендом"""
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

# 1. Управление тарифами
@app.get("/api/tariffs", response_model=TariffBase)
async def get_tariffs():
    """Получить текущие тарифы"""
    return db.tariffs

@app.put("/api/tariffs")
async def update_tariffs(new_tariffs: TariffBase):
    """Обновить тарифы"""
    db.tariffs = new_tariffs
    return {"message": "Тарифы успешно обновлены", "tariffs": db.tariffs}

# 2. Расчет квартплаты
@app.post("/api/calculate")
async def calculate_payment_endpoint(request: CalculationRequest):
    """Рассчитать квартплату"""
    
    # Валидация данных
    if request.apartment.area <= 0:
        raise HTTPException(status_code=400, detail="Площадь должна быть положительной")
    
    if request.apartment.residents <= 0:
        raise HTTPException(status_code=400, detail="Количество жильцов должно быть положительным")
    
    # Проверка показаний (текущие не могут быть меньше предыдущих)
    prev = db.previous_readings.get(request.apartment.number)
    if prev:
        if (request.readings.cold_water < prev.cold_water or
            request.readings.hot_water < prev.hot_water or
            request.readings.electricity < prev.electricity):
            raise HTTPException(status_code=400, detail="Текущие показания не могут быть меньше предыдущих")
    
    # Выполняем расчет
    calculation_result = calculate_payment(request.apartment, request.readings, db.tariffs)
    
    return {
        "apartment": request.apartment,
        "readings": request.readings,
        "previous_readings": db.previous_readings.get(request.apartment.number),
        "calculation": calculation_result,
        "period": request.period
    }

# 3. Сохранение в историю
@app.post("/api/payments")
async def create_payment_record(request: CalculationRequest):
    """Сохранить расчет в историю платежей"""
    
    # Выполняем расчет
    calculation_result = calculate_payment(request.apartment, request.readings, db.tariffs)
    
    # Сохраняем текущие показания как предыдущие для следующего расчета
    db.previous_readings[request.apartment.number] = request.readings
    
    # Создаем запись в истории
    payment_record = PaymentRecord(
        id=str(uuid.uuid4()),
        period=request.period,
        apartment=request.apartment,
        readings=request.readings,
        calculation=calculation_result,
        total_amount=calculation_result["total"],
        is_paid=False,
        created_at=datetime.now().isoformat()
    )
    
    db.payment_history.append(payment_record)
    
    return {
        "message": "Расчет сохранен в историю",
        "record": payment_record
    }

# 4. Управление историей платежей
@app.get("/api/payments", response_model=List[PaymentRecord])
async def get_payment_history(apartment_number: Optional[str] = None):
    """Получить историю платежей"""
    history = db.payment_history
    
    # Фильтрация по номеру квартиры если указан
    if apartment_number:
        history = [record for record in history if record.apartment.number == apartment_number]
    
    # Сортировка по дате (новые сверху)
    history.sort(key=lambda x: x.created_at, reverse=True)
    
    return history

@app.put("/api/payments/{payment_id}")
async def update_payment_status(payment_id: str, update: PaymentUpdate):
    """Обновить статус оплаты"""
    for record in db.payment_history:
        if record.id == payment_id:
            record.is_paid = update.is_paid
            return {"message": "Статус оплаты обновлен", "record": record}
    
    raise HTTPException(status_code=404, detail="Запись не найдена")

@app.delete("/api/payments/{payment_id}")
async def delete_payment_record(payment_id: str):
    """Удалить запись из истории"""
    for i, record in enumerate(db.payment_history):
        if record.id == payment_id:
            deleted_record = db.payment_history.pop(i)
            return {"message": "Запись удалена", "record": deleted_record}
    
    raise HTTPException(status_code=404, detail="Запись не найдена")

# 5. Получение предыдущих показаний
@app.get("/api/readings/{apartment_number}")
async def get_previous_readings(apartment_number: str):
    """Получить предыдущие показания для квартиры"""
    readings = db.previous_readings.get(apartment_number)
    if readings:
        return {"apartment_number": apartment_number, "readings": readings}
    else:
        return {
            "apartment_number": apartment_number, 
            "readings": MeterReadings(cold_water=0, hot_water=0, electricity=0),
            "message": "Предыдущие показания не найдены"
        }

# ==================== ЗАГРУЗКА ТЕСТОВЫХ ДАННЫХ ====================
@app.on_event("startup")
async def startup_event():
    """Создание тестовых данных при запуске"""
    
    # Тестовые предыдущие показания
    db.previous_readings = {
        "25": MeterReadings(cold_water=110, hot_water=75, electricity=1150),
        "26": MeterReadings(cold_water=95, hot_water=60, electricity=980)
    }
    
    # Тестовая история платежей
    test_apartment = ApartmentData(
        number="25",
        owner="Иванов И.И.",
        area=45.6,
        residents=3
    )
    
    test_readings = MeterReadings(
        cold_water=125,
        hot_water=85, 
        electricity=1250
    )
    
    test_calculation = calculate_payment(test_apartment, test_readings, db.tariffs)
    
    db.payment_history.append(PaymentRecord(
        id=str(uuid.uuid4()),
        period="2024-01",
        apartment=test_apartment,
        readings=test_readings,
        calculation=test_calculation,
        total_amount=test_calculation["total"],
        is_paid=True,
        created_at=datetime.now().isoformat()
    ))
    
    print("✅ АИС Расчет кварплаты запущена!")
    print("🌐 Откройте http://localhost:8000 в браузере")
    print("📚 API документация: http://localhost:8000/docs")
    print("💾 Тестовые данные загружены")

# ==================== ЗАПУСК СЕРВЕРА ====================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)