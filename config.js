let config = {
    discord: {
        token: "",
        curation: {
            channel: "522337378329952256", // the channel where the curation takes place
            guild: "418646135725359104", // the guild where the curation takes place
            role: "473760034023538689", // Discord role ID for the CurationTeam (in onelovedtube server) role
            curation_emojis: { // this emojis are used by the bot to calculate the vote
                up: "👍",
                down: "👎",
                one_hundred: "💯",
                game_die: "🎲",
                heart: '❤'
            },
            other_emojis: {
                clock: "⏰", // waiting for curators to add reactions
                check: "✅", // voted
                cross: "❌", // not voted
            },
            votes: {
                min: 100,
                max: 3500
            },
            min_age: 5, // minimum post age for voting
            timeout_minutes: 1 // wait x minutes after posting until the bot votes
        }
    },
    steem: {
        wif: "",
        account: "onelovecuration"
    },
    resteem: {
        wif: "",
        account: "onelovedtube",
        threshold: 8000 // set this to any value above 10000 to disable resteem, or 1 to resteem all upvoted posts
    },
    mainAccount: "onelovedtube", // default account for obtaining voting mana
    voting_threshold: 90, // minimum voting mana required to curate videos
    team: [
        "d00k13",
        "graylan",
        "gray00",
        "toddmck",
        "techcoderx",
        "zainenn",
        "priyanarc",
        "deepsouthpiddlin",
        "vaultec"
    ],
    autovoteList: [
        "mvd",
        "d00k13",
        "vaultec",
        "deepsouthpiddlin",
        "priyanarc",
        "gaborockstar",
        "kaerpediem",
        "rem-steem"
    ],
    blacklistedUsers: [
        "muhammadrizki96",
        "jacksonchakma",
        "kawaiicrush",
        "steemnurse",
        "girlygamer",
        "dcooperation",
        "clixmoney"
    ],
    status_command_enabled: true,
    avalon: {
        account: 'onelovecuration',
        wif: '',
        vpMultiplier: 2,
        vpToSpendForFeedback: 20,
        tag: ''
    },
    database: {
        host: "localhost",
        user: "root",
        password: "Wjf9qWF2VaKN",
        database: "dtube",
	    charset: "utf8mb4"
    },
    mod_settings: {
        enabled: true,
        group_name: "get-help",
        faq: {
            "error404": [ // the key. Usage like !faq error
                "I'm getting an ERROR 404 while pinning videos. What is wrong?", // the displayed question
                "Either the resolution you're trying to pin is not available as a playback option on DTube, or the video file doesn't exists on DTube's servers. Perhaps try pinning another resolution of the video?" // and the displayed answer
            ],
            "error404_uploader": [
                "I'm getting a 404 error when I am trying to run pinning commands on videos uploaded through 3rd party uploaders. What is happening?",
                "Our pinning bot downloads videos from video.dtube.top gateway only, which is not connected to the IPFS network. If you need those videos to be pinned, please contact an admin for assistance."
            ],
            "error504": [
                "I'm getting another ERROR but this time it's code 504!",
                "504 errors are gateway timeout errors. Right now the bot pulls videos from video.dtube.top gateway, which means if their servers are down the pinning commands will not work. Try again later."
            ],
            "permissions": [
                "The bot is telling me that I have no permissions to pin videos.",
                "OneLoveDTube IPFS hosting is a paid service for $10 USD/month. If you have paid for this month and error still persists, please contact an admin for assistance. If using community-member provided IPFS bots, contact the bot owner for help."
            ],
            "supported_res": [
                "What resolutions are supported on the IPFS bots?",
                "We support a wide range of resolutions from 240p up to 1080p. Source pinning is supported, which means it's technically possible to pin 4K videos. While our servers are able to handle it, it may take longer time for the video to be fetched and pinned."
            ],
            "hosting_package": [
                "How much do I have to pay for your hosting services?",
                "The price is currently $10 USD/month for access to OneLoveDTube IPFS pinning commands and access to uploader."
            ],
            "onelovevote": [
                "When will I get an upvote from you?",
                "Upvotes are not guaranteed to anyone. We suggest posting quality videos to DTube on a regular basis. This will better your chance at our curators seeing them. If we miss your video, it does NOT reflect on you as an artist and suggest becoming a daily video contributor to the platform."
            ],
            "playback_error_old": [
                "Why wont my older videos that I pinned to your servers play?",
                "If you are a paying user since the day you started to pin your videos to our servers, it's likely that your video is not being viewed frequently, which means that the video may take some time to get cached to the IPFS gateways for it to be loaded."
            ],
            "password": [
                "I lost my Password, Can you Help?",
                "Unfortunately. No we cant because we didnt create your account and due to how the blockchain works you can not just get an email with a new password. If your account was hacked, created at steemit.com and you still have your old owner key go here to recover your account: https://steemit.com/recover_account_step_1"
            ],
            "uploader": [
                "Where can I find answers to my questions regarding the uploader?",
                "The uploader FAQ can be found [here](https://github.com/techcoderx/ipfsVideoUploader/blob/master/docs/FAQ.md)."
            ]
        }
    }
}

module.exports = config
