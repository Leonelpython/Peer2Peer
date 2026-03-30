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

let name = 'fast and furious 6'

async function createThreads(threads_name, threads_number) {
    for(let i = 0; i < threads_number.length; i++) {
        if(i < threads_number[i]) {
            if("extract_workers" in threads_name)
                extract_workers.push(new Worker(threads_name["extract_workers"]))
            if("hash_workers" in threads_name)
                hash_workers.push(new Worker(threads_name["hash_workers"]))
            if("IPPort_workers" in threads_name)
                IPPort_workers.push(new Worker(threads_name["IPPort_workers"]))
            if("disk_workers" in threads_name)
                disk_workers.push(new Worker(threads_name["disk_workers"]))
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
        let metadata = await DhtByHash(hash_workers, extract_workers, IPPort_workers, null, name, true, null, null, true, true)
        metadata.then(async (data) => {
            await dhtByIpPort("download", IPPort_workers, metadata.infoHash, extract_workers, null, false, storage, data, true)
        }).catch((err) => {
            console.error(`error by hash: ${err}`)
        })
        index++
        ext_index++
    }

}

async function download_byhash(hash) {
    let threads_name = {IPPort_workers: './threads/metadata_by_ip_port.js', extract_workers: './threads/extract.js', disk_workers: './threads/disk.js'}
    let threads_number = [8, 8, 1]

    let created = await createThreads(threads_name, threads_number)

    if(created) {
        if(index > hash_workers.length) {
            index = 0
        }
        if(ext_index > hash_workers.length) {
            index = 0
        }
        let metadata = await dhtByIpPort("metadata_byIPPort", IPPort_workers, hash, extract_workers, null, false, null, null, true)
        metadata.then(async (data) => {
            await dhtByIpPort("download", IPPort_workers, hash, extract_workers, null, false, storage, data, true)
        }).catch((err) => {
            console.error(`error by hash: ${err}`)
        })

        index++
        ext_index++
    }
}

async function crawl() {
    let threads_name = {extract_workers: './threads/extract.js', hash_workers: './threads/metadata_by_hash.js', IPPort_workers: './threads/metadata_by_ip_port.js'}
    let threads_number = [4, 6, 6]

    let created = await createThreads(threads_name, threads_number)

    if(created) {
        await DhtByHash(hash_workers, extract_workers, IPPort_workers, null, null, false, null, null, true, true)
        index++
        ext_index++
    }
}

await crawl()

app.listen(port, () => {
    console.log(`listinning: http://localhost:${port}`)
})

export default express