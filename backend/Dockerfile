FROM python:3.10-slim

WORKDIR /app

# Instalar dependências essenciais do sistema (para compilar bibliotecas se necessário)
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Copiar requirements primeiro (para aproveitar o cache do Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o restante do código
COPY . .

# Expor a porta 8000 (onde o Uvicorn roda)
EXPOSE 8000

# Comando para iniciar o servidor
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
