import { Pool } from "pg"

export const pool = new Pool({
    host: 'localhost',
    user: 'postgres',
    password: 'brice360',
    database: 'brice',
    port: 5434
})

pool.setMaxListeners(500)