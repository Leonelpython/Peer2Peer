import { DhtByHash, dhtByIpPort, servers, ports } from "./Servers/server.js";
// import { router } from "./Routes/routes.js";
import express from "express"
import helmet from "helmet";
import cors from "cors"
import session from "express-session";
import { loadEnvFile } from "process";
import { hash_workers, IPPort_workers, extract_workers, disk_workers, GetMetadataByHash, GetMetadataByIPPort, Downloader, createThreads } from "./Data.js"

loadEnvFile('./.env')

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
// const app = http.createServer((req, res) => {
//     res.writeHead(200, {"content-type": "application/json"})
//     res.end()
// })

app.use(helmet())
app.use(cors())
app.use(sess)
// app.use(router)

let name = 'fast and furious 6'

const storage = {}

async function download_byname(name) {
    let threads_name = {extract_workers: './threads/extract.js', hash_workers: './threads/metadata_by_hash.js', IPPort_workers: './threads/metadata_by_ip_port.js', disk_workers: './threads/disk.js'}
    let threads_number = [5, 5, 5, 1]

    let created = await createThreads(threads_name, threads_number)

    if(created) {
        let metadata = await DhtByHash(hash_workers, extract_workers, IPPort_workers, null, name, true, null, null, true, true)
        await dhtByIpPort("download", IPPort_workers, metadata.infoHash, extract_workers, null, false, storage, data, true, true)
    }

}

async function download_byhash(hash) {
    let threads_name = {IPPort_workers: './threads/metadata_by_ip_port.js', extract_workers: './threads/extract.js', disk_workers: './threads/disk.js'}
    let threads_number = [8, 8, 1]

    let created = await createThreads(threads_name, threads_number)

    if(created) {
        let metadata = await dhtByIpPort("metadata_byIPPort", IPPort_workers, hash, extract_workers, null, null, true, true)
        await dhtByIpPort("download", IPPort_workers, hash, extract_workers, storage, metadata, true, true)
    }
}

async function crawl() {
    let threads_name = {extract_workers: './threads/extract.js', hash_workers: './threads/metadata_by_hash.js', IPPort_workers: './threads/metadata_by_ip_port.js'}
    let threads_number = [4, 6, 6]

    let created = await createThreads(threads_name, threads_number)

    console.log(`threads created`)
    console.log(`threads ip : ${JSON.stringify(IPPort_workers)}`)
    console.log(`threads ip 0 : ${JSON.stringify(IPPort_workers[0])}`)

    if(created) {
        await DhtByHash(hash_workers, extract_workers, IPPort_workers, null, null, false, null, null, true, true)
    }
}

await crawl()

app.listen(3000, () => {
    console.log(`listinning: http://localhost:${3000}`)
})

export default express