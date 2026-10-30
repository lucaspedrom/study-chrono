# Estágio 1: Build do Frontend React + Vite
FROM node:22-alpine AS builder

WORKDIR /app

# Copia arquivos de dependências
COPY package.json package-lock.json ./

# Instala dependências de forma reproduzível
RUN npm ci

# Copia todo o código-fonte (respeitando o .dockerignore)
COPY . .

# Executa o build de produção (gera a pasta dist/)
RUN npm run build

# Estágio 2: Servidor Nginx de alta performance e imagem mínima
FROM nginx:alpine

# Remove o arquivo default do Nginx
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copia a configuração otimizada para Cloud Run e SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos compilados da etapa anterior
COPY --from=builder /app/dist /usr/share/nginx/html

# O Cloud Run direciona requisições por padrão para a porta 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
