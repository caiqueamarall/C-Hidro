# Estágio 1: Build da aplicação React/Vite
FROM node:18-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Estágio 2: Nginx para servir a aplicação
FROM nginx:alpine

# Remove as configurações padrão do Nginx
RUN rm /etc/nginx/conf.d/default.conf

# Copia nossa configuração de proxy customizada (que resolve o CORS da ANA)
COPY nginx.conf /etc/nginx/conf.d/

# Copia os arquivos gerados pelo Vite (estáticos) para a pasta do Nginx
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
