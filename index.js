import { Metaplex, PublicKey } from '@metaplex-foundation/js'
import { Connection } from '@solana/web3.js'
import express from 'express'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(express.json()) // Middleware to parse JSON bodies

// Replace with your Discord webhook URL
const PORT = process.env.PORT || 8787
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL
const BIRDEYE_KEY = process.env.BE_KEY
const HELIUS_API = process.env.HELIUS_API

const getMetaData = async (metaplex, tokenMint) => {
    const md = await metaplex
        .nfts()
        .findByMint({ mintAddress: new PublicKey(tokenMint) })

    return md
}

const getConnection = async () => {
    const connection = new Connection(
        `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API}`,
        {
            commitment: 'confirmed'
        }
    )

    return connection
}

const getSolPrice = async () => {
    const options = {
        method: 'GET',
        headers: { 'X-API-KEY': BIRDEYE_KEY }
    }
    const data = await fetch(
        'https://public-api.birdeye.so/public/price?address=So11111111111111111111111111111111111111112',
        options
    )
    const response = await data.json()
    return response.data.value.toFixed(2)
}

const getMessage = async ({
    source,
    signature,
    timeStamp,
    ca,
    metaData,
    lp
}) => {
    // console.log(metaData)

    let fields = [
        {
            name: 'Token address',
            value: ca,
            inline: false
        },
        {
            name: 'Birdeye',
            value: `[Birdeye](https://birdeye.so/token/${ca}?chain=solana)`,
            inline: true
        },
        {
            name: 'Solscan',
            value: `[Solscan](https://solscan.io/tx/${signature})`,
            inline: true
        },
        {
            name: 'SOL LP',
            value: `$${lp}`,
            inline: true
        }
    ]
    if (metaData.extensions != undefined || metaData.extensions != null) {
        if (
            metaData.extensions.website != undefined ||
            metaData.extensions.website != null
        ) {
            fields.push({
                name: 'Website',
                value: `[Website](${metaData.extensions.website})`,
                inline: true
            })
        }

        if (
            metaData.extensions.twitter != undefined ||
            metaData.extensions.twitter != null
        ) {
            fields.push({
                name: 'Twitter',
                value: `[Twitter](${metaData.extensions.twitter})`,
                inline: true
            })
        }
        if (
            metaData.extensions.telegram != undefined ||
            metaData.extensions.telegram != null
        ) {
            fields.push({
                name: 'Telegram',
                value: `[Telegram](${metaData.extensions.telegram})`,
                inline: true
            })
        }
    }

    const message = {
        content: `New ${source} LP`,
        embeds: [
            {
                title: metaData.symbol,
                description: metaData.description,
                fields,
                image: {
                    url: metaData.image
                }
            }
        ]
    }

    console.log(message)
    // const msg =
    //     `\n ${metaData.image} \n` +
    //     `website: ${website}\n` +
    //     `twitter: ${twitter}\n` +
    //     `Telegram: ${telegram}\n` +
    //     `source: ${source}\n` +
    //     `Token name: ${metaData.symbol}\n` +
    //     `CA: ${ca}\n` +
    //     `SOL LP amount added: $${lp}\n` +
    //     `Birdeye: https://birdeye.so/token/${ca}?chain=solana\n` +
    //     `signature: https://solscan.io/tx/${signature}\n` +
    //     `Timestamp: ${timeStamp}\n\n`

    return message
}

const sendMessage = async (body) => {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    })

    return res
}

const getTransactionAmounts = async (tokenTransfers) => {
    let solAmt
    tokenTransfers.forEach((elem) => {
        if (elem.mint === 'So11111111111111111111111111111111111111112') {
            solAmt = elem.tokenAmount
        }
    })

    return solAmt
}

app.post('/', async (req, res) => {
    //  res.status(200).send('Logged POST request body.')

    const [data] = req.body
    // console.log(JSON.stringify(data))
    const connection = await getConnection()

    const tokenMint =
        data.tokenTransfers[1].mint ===
        'So11111111111111111111111111111111111111112'
            ? data.tokenTransfers[0].mint
            : data.tokenTransfers[1].mint

    const timeStamp = new Date(data.timestamp * 1000).toLocaleString('en-US', {
        timeZone: 'Asia/Manila'
    })

    const metaplex = new Metaplex(connection)

    const metaData = await getMetaData(metaplex, tokenMint)
    const solAmt = await getTransactionAmounts(data.tokenTransfers)
    const solPrice = await getSolPrice()

    const lpPriceAmt = parseInt(solPrice) * parseInt(solAmt)
    if (lpPriceAmt >= 1500) {
        const body = JSON.stringify(
            await getMessage({
                feePayer: data.feePayer,
                source: data.source,
                signature: data.signature,
                ca: tokenMint,
                timeStamp,
                lp: lpPriceAmt.toFixed(2),
                metaData: metaData.json
            })
        )

        await sendMessage(body)
    } else {
        console.log('low lp ')
    }

    // console.log('Received data:', JSON.stringify(req.body))
    res.status(200).send('Logged POST request body.')
})

app.use('/', (req, res, next) => {
    res.status(405).send('Method not allowed.')
})

// Catch-all for any other routes not defined above
app.use((req, res) => {
    res.status(404).send('Not Found')
})

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
