FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["sh", "-c", "echo 'crit-api skeleton ready. Add TypeScript server files before running the API.' && tail -f /dev/null"]
