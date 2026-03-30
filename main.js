import { Worker } from "worker_threads";
import { port, index, ext_index, name } from "./Data.js";
import { DhtByHash, dhtByIpPort } from "./Servers/server.js";
import { router } from "./Routes/routes.js";
import express from "express"
import helmet from "helmet";
import cors from "cors"
import session from "express-session";
import { loadEnvFile } from "process";

loadEnvFile('/.env')

let port = 3000

export const sess = session({
    saveUninitialized: true,
    resave: true,
    secret: process.env.SECRET,
    cookie: {
        secure: false,
        httpOnly: true
    }
})
const app = express()
app.use(helmet())
app.use(cors())
app.use(sess)
app.use(router)

let index = 0

const storage = {}

const hash_workers = []
const IPPort_workers = []
const extract_workers = []
const disk_workers = []

let check = setInterval(async () => {
    if(hasmetadata) {
        await dhtByIp()
        clearInterval(check)
    }
}, 1000)

let name = 'fast and furious 6'

await download(name)

async function createThreads(threads_name, threads_number) {
    for(let i = 0; i < threads_number.length; i++) {
        if(i < threads_number[i]) {
            if("extract_workers" in threads_name)
                extract_workers.push(new Worker(threads_name[extract_worker]))
            if("hash_workers" in threads_name)
                hash_workers.push(new Worker(threads_name[hash_workers]))
            if("IPPort_workers" in threads_name)
                IPPort_workers.push(new Worker(threads_name[IPPort_workers]))
            if("disk_workers" in threads_name)
                disk_workers.push(new Worker(threads_name[disk_workers]))
        }
    }
    return true
}

async function download_byname(name) {
    let threads_name = {extract_workers: './threads/extract.js', hash_workers: './threads/metadata_by_hash.js', IPPort_workers: './threads/metadata_by_ip_port.js', disk_workers: './threads/disk.js'}
    let threads_number = [5, 5, 5, 1]

    let created = await createThreads(threads_name, threads_number)

    if(created) {
        if(index > hash_workers.length) {
            index = 0
        }
        if(ext_index > hash_workers.length) {
            index = 0
        }
        let metadata = await DhtByHash(hash_workers[index], extract_worker[ext_index], name, by_name=true)
        if(metadata) {
            console.log(`metadata: ${metadata}`)
            await dhtByIpPort("download", IPPort_workers[index], metadata.infoHash, metadata, storage)
        }
        index++
        ext_index++
    }

}

async function download_byhash(hash) {
    let threads_name = {IPPort_workers: './threads/metadata_by_ip_port.js', disk_workers: './threads/disk.js'}
    let threads_number = [16, 1]

    let created = await createThreads(threads_name, threads_number)

    if(created) {
        if(index > hash_workers.length) {
            index = 0
        }
        if(ext_index > hash_workers.length) {
            index = 0
        }
        let metadata = await dhtByIpPort("metadata_byIPPort", IPPort_workers[index], hash, storage=storage)
        if(metadata) {
            console.log(`metadata: ${metadata}`)
            await dhtByIpPort("download", IPPort_workers[index], hash, metadata, storage)
        }
        index++
        ext_index++
    }

}

async function crawl() {
    let threads_name = {extract_workers: './threads/extract.js', hash_workers: './threads/metadata_by_hash.js', IPPort_workers: './threads/metadata_by_ip_port.js'}
    let threads_number = [4, 6, 6]

    let created = await createThreads(threads_name, threads_number)

    if(created) {
        if(index > hash_workers.length) {
            index = 0
        }
        if(ext_index > hash_workers.length) {
            index = 0
        }
        await DhtByHash(hash_workers[index], extract_workers[ext_index], other_worker = IPPort_workers[index])
        index++
        ext_index++
    }

}

app.listen(port, () => {
    console.log(`listinning: http://localhost:${port}`)
})

export default express