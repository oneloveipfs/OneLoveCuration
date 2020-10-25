const Discord = require('discord.js');
const client = new Discord.Client();
const hive = require('@hiveio/hive-js')
const steem = require("steem");
const blurt = require('@blurtfoundation/blurtjs')
const asyncjs = require('async')
const javalon = require('javalon');
const fetch = require("node-fetch");
// const ChartjsNode = require('chartjs-node');
// const chartNode = new ChartjsNode(720, 720 * .5);
// const Sentry = require('@sentry/node');
// Sentry.init({ dsn: 'https://f99fbe1e544b441c8ff7851df1267049@sentry.io/1430210' });

const config = require('./config');
const helper = require('./helper');

steem.api.setOptions({url: config.steem.api , useAppbaseApi: true})
javalon.init({ api: config.avalon.api })
hive.api.setOptions({url: config.hive.api, useAppbaseApi: true, rebranded_api: true})
hive.broadcast.updateOperations()
blurt.api.setOptions({ url: config.blurt.api })

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

function buildCurationTable(DB_RESULT) {
    DB_RESULT = DB_RESULT.reverse();
    let data = [
        '```+--------+-----------+',
        '|Videos  |Date       |',
        '+--------------------+',

    ];

    for (let i = 0; i < DB_RESULT.length; i++) {
        data.push("|" +
            DB_RESULT[i].count +
            " ".repeat(8 - DB_RESULT[i].count.toString().length) + "|" +
            (new Date(DB_RESULT[i].posted)).toLocaleDateString("en-US") +
//            " ".repeat(9 - (new Date(DB_RESULT[i].posted)).toLocaleDateString("en-US").length ) +
            " " +
            "|"
        );
    }

    data.push('+--------+-----------+```');
    return data.join("\n");
}

async function countCurators() {
    let guild = await client.guilds.fetch(config.discord.curation.guild)
    return guild.roles.cache.get(config.discord.curation.role).members.size
}

async function getBlacklistEntries(user) {
    let entries = await (await fetch("http://blacklist.usehive.com/user/" + user)).json();
    return {
        entries: entries.blacklisted,
        text: entries.blacklisted.join(", "),
        count: entries.blacklisted.length
    }
}

async function handleLink(msg) {
    // Check if voting mana is above threshold
    let steemacc, hiveacc, dtcacc, dtccontent
    try {
        steemacc = await helper.apis.getAccount(config.mainAccount,'steem')
        hiveacc = await helper.apis.getAccount(config.mainAccount,'hive')
        dtcacc = await helper.apis.getAvalonAccount(config.mainAccount)
    } catch (e) {
        console.log('Get @onelovedtube account error',err)
        return msg.channel.send('An error occured. Please check the logs!')
    }
    if (helper.insufficientMana(dtcacc,steemacc,hiveacc)) {
        return msg.channel.send('Voting mana is below required threshold. Please wait for our mana to recharge and try again later.')
    }
    const link = helper.DTubeLink(msg.content);
    let video = new Discord.MessageEmbed();
    video.setFooter("Powered by oneloved.tube Curation").setTimestamp();
    let authorInformation = link.replace('/#!', '').replace('https://d.tube/v/', '').replace('https://dtube.techcoderx.com/v/', '').split('/')
    if (config.autovoteList.includes(authorInformation[0])) return msg.channel.send('Author is in our autovote list therefore cannot be manually curated.')
    if (config.blacklistedUsers.includes(authorInformation[0])) return msg.channel.send('Author is in the curation blacklist.')
    try {
        dtccontent = await helper.apis.getAvalonContent(authorInformation[0], authorInformation[1])
    } catch (e) {
        msg.channel.send("An error occured with fetching Avalon content.")
        return console.log('Avalon get content error',err)
    }
    let json = dtccontent.json
    let posted_ago = Math.round(helper.getMinutesSincePost(new Date(dtccontent.ts)));
    let waitTime = config.discord.curation.timeout_minutes
    let efficiency = 1
    if (posted_ago < config.discord.curation.min_age) {
        waitTime = config.discord.curation.min_age - posted_ago
    }
    if (!json.files || (!json.files.ipfs || !json.files.ipfs.vid || !json.files.ipfs.vid.src) &&
                       (!json.files.btfs || !json.files.btfs.vid || !json.files.btfs.vid.src) &&
                       (!json.files.sia || !json.files.sia.vid || !json.files.sia.vid.src)) {
        efficiency = 0.5
    }
    if (posted_ago > 2880)
        return msg.channel.send("This video is too old for curation through oneloved.tube");
    var topTags = []
    for (const key in dtccontent.tags)
        topTags.push(key)
    if (topTags.length == 0)
        topTags.push('No tags yet')
    video.setTitle(json.title.substr(0, 512))
        .setAuthor("@" + dtccontent.author, null, "https://d.tube/#!/c/" + dtccontent.link)
        .setThumbnail(json.thumbnailUrl)
        .setDescription("[Watch Video](" + link + ")")
        .addField("Tags", topTags.join(', '), true)
        .addField("Uploaded", posted_ago + ' minutes ago', true)
        .setColor(0x3fafff)
    try {
        let exist = await helper.database.existMessage(dtccontent.author, dtccontent.link);
        if (!exist) {
            let embed = await msg.channel.send({embed: video})
            let clockReaction = await embed.react(config.discord.curation.other_emojis.clock)
            setTimeout(async () => {
                clockReaction.remove();
                let message = await helper.database.getMessage(dtccontent.author, dtccontent.link)
                helper.vote(message, client, efficiency).then(async () => {
                    let msg = await helper.database.getMessage(dtccontent.author, dtccontent.link)
                    embed.react(config.discord.curation.other_emojis.check);
                    video.addField("Vote Weight", (msg.vote_weight / 100) + "%", true);
                    video.addField("VP Spent",msg.vp_spent,true)
                    embed.edit({embed: video})
                }).catch(error => {
                    let errmsg = "An error occured while voting. Please check the logs!"
                    video.addField("ERROR", errmsg)
                    embed.edit({embed: video})
                    console.error('Failed to vote! Error: ' + error)
                    embed.react(config.discord.curation.other_emojis.cross)
                })
            }, 60 * 1000 * waitTime)
            helper.database.addMessage(embed.id, dtccontent.author, dtccontent.link)
        } else msg.channel.send("This video has already been posted to the curation channel.")
    } catch (err) {
        msg.channel.send("An error occured with Discord or curation database. Please check the logs!")
        console.log(err);
    }
}

client.on('message', async msg => {
    if (msg.author.bot) return

    if (msg.content.startsWith("!table")) {
        let days = parseInt(msg.content.replace("!table", "").trim());
        if (isNaN(days)) {
            days = 7
        }
        if (days < 1 || days > 14) {
            days = 7
        }

        helper.database.getMessageSummary(days).then(data => {
            msg.channel.send(buildCurationTable(data))
        })
    }

    if (msg.content.startsWith("!steem") || msg.content.startsWith("!hive") || msg.content.startsWith("!blurt")) {
        let network = msg.content.split(' ')[0].substr(1)
        let networkUCase = helper.uppercasefirst(network)
        let user = msg.content.replace('!steem','').replace('!hive','').replace('!blurt','').trim()
        console.log('lookup',network,networkUCase,user)

        if (steem.utils.validateAccountName(user) !== null)
            user = config.mainAccount

        let res = await helper.apis.getAccount(user,network)
        if (res.length === 0)
            return msg.reply(user + " seems not to be a valid " + networkUCase + " account");
        asyncjs.parallel({
            msgCount: (cb) => {
                helper.database.countMessages().then(count => cb(null,count))
            },
            spCount: (cb) => {
                helper.apis.getPower(user,network).then(sp => cb(null,sp))
            },
            mana: (cb) => {
                helper.apis.getVotingMana(user,network).then(vp => cb(null,vp))
            },
            voteValue: (cb) => {
                helper.getVoteValue(10000,user,network,(err,vote_value) => cb(err,vote_value))
            },
            blacklist: (cb) => {
                if (network === 'hive')
                    getBlacklistEntries(user).then(blacklist => cb(null,blacklist))
                else
                    cb(null,{entries: [], text: '', count: 0}) // TODO: Blacklists for more networks
            }
        },async (errors,results) => {
            let status = new Discord.MessageEmbed();
            status.setFooter("Powered by oneloved.tube Curation");
            if (user === config.mainAccount) {
                status.setTitle("OveLoveCuration Bot - Status Overview");
            } else {
                status.setTitle("@" + user + " - Status Overview");
            }

            let avatarUrl = ''
            switch (network) {
                case 'hive':
                    avatarUrl = 'https://images.hive.blog/u/' + user + '/avatar'
                    break
                case 'steem':
                    avatarUrl = 'https://steemitimages.com/u/' + user + '/avatar'
                    break
                case 'blurt':
                    avatarUrl = 'https://images.blurt.blog/u/' + user + '/avatar'
                    break
                default:
                    break
            }

            status.setThumbnail(avatarUrl);
            status.setColor(0x009aa3);
            if (user === config.mainAccount) {
                status.addField("Total Curated Videos:", results.msgCount[0].count, true);
                status.addField("Total Number of Curators:", await countCurators(), true);
            }

            status.addField("Current 100% Vote Value:","$" + results.voteValue.toFixed(3), true);
            status.addField("Current " + networkUCase + " Power:", results.spCount.toFixed(3) + " " + networkUCase.substr(0,1) + "P", true);
            status.addField("Current Voting Power:", results.mana + "%", true);

            if (results.blacklist.count > 0 && !config.team.includes(user)) {
                status.addField("Blacklisted:",results.blacklist.text);
            } else if (config.team.includes(user)) {
                status.addField("OneLoveDTube Team Member:","Yes 🤟");
            }
            msg.channel.send(status)
        })
    }

    if (msg.channel.id === config.discord.curation.channel) {
        if (msg.content.startsWith("!feedback")) {
            let parts = msg.content.replace("!feedback").trim().split(" ").slice(1);
            if (parts.length >= 2) {
                const video = helper.DTubeLink(parts[0].trim());
                const link = video;
                if (video !== undefined) {
                    const feedback = parts.slice(1).join(" ");

                    let authorInformation = video.replace('/#!', '').replace('https://d.tube/v/', '').split('/');
                    helper.database.feedBackExist(authorInformation[0], authorInformation[1]).then(exist => {
                        if (exist.length !== 0) {
                            console.log(exist[0].discord)
                            let user = client.guilds.get(config.discord.curation.guild).members.get(exist[0].discord)
                            let video = new Discord.MessageEmbed();
                            video.setFooter("Powered by oneloved.tube Curation")
                                .setTimestamp()
                                .setTitle("Feedback for: @" + exist[0].author + '/' + exist[0].permlink)
                                .addField("View Video", "[Watch Video](https://d.tube/#!/v/" + exist[0].author + "/" + exist[0].permlink + ")", true)
                                .setDescription("This video already received feedback from <@" + user.user.id + '>')
                                .addField("Feedback", exist[0].message, true)
                                .setColor("LUMINOUS_VIVID_PINK");
                            msg.channel.send(video);
                        } else {
                            javalon.getContent(authorInformation[0],authorInformation[1],async (err,result) => {
                                let posted_ago = Math.round(helper.getMinutesSincePost(new Date(result.ts)))
                                let video = new Discord.MessageEmbed()
                                let topTags = []
                                for (const key in result.tags)
                                    topTags.push(key)
                                if (topTags.length == 0)
                                    topTags.push('No tags yet')
                                video.setFooter("Powered by d.tube curation")
                                    .setTimestamp()
                                    .setTitle("Feedback for: @" + result.author + '/' + result.link)
                                    .setAuthor("@" + result.author, 'https://image.d.tube/u/' + result.author + '/avatar', "https://d.tube/#!/c/" + result.author)
                                    .setThumbnail(result.json.thumbnailUrl)
                                    .setDescription("[Watch Video](" + link + ")")
                                    .addField("Tags", topTags.join(', '), true)
                                    .addField("Uploaded", posted_ago + ' minutes ago', true)
                                    .setColor("DARK_GOLD")
                                
                                let commentLink = helper.generatePermlink()
                                let feedbackFooter = '\n![](https://cdn.discordapp.com/attachments/429110955914428426/520078555204288524/dtubeanimated2.gif)\nThis feedback was posted by ' + msg.author.username + ' through [OneLoveCuration Discord Bot](https://github.com/techcoderx/OneLoveCuration).'
                                msg.channel.send(video).then(async (embed) => {
                                    // Generate Avalon comment
                                    let avalonCommentTx = {
                                        type: 4,
                                        data: {
                                            link: commentLink,
                                            pa: result.author,
                                            pp: result.link,
                                            json: {
                                                app: 'onelovedtube/feedback',
                                                title: '',
                                                description: feedback,
                                                refs: []
                                            },
                                            vt: config.avalon.vpToSpendForFeedback,
                                            tag: config.avalon.tag,
                                        }
                                    }

                                    // Steem comment
                                    let steempa, steempp
                                    if (result.json.refs) for (let i = 0; i < result.json.refs.length; i++) {
                                        let ref = result.json.refs[i].split('/')
                                        if (ref[0] === 'steem') {
                                            avalonCommentTx.data.json.refs = ['steem/' + ref[1] + commentLink]
                                            steempa = ref[1]
                                            steempp = ref[2]
                                            break
                                        }
                                    }

                                    // Comment broadcasts
                                    let commentOps = {
                                        avalon: (cb) => {
                                            let signedTx = javalon.sign(config.avalon.wif,config.avalon.account,avalonCommentTx)
                                            javalon.sendTransaction(signedTx,(err,aresult) => {
                                                if (err) return cb(err)
                                                cb(null,aresult)
                                            })
                                        }
                                    }

                                    if (steempa && steempp) {
                                        commentOps.steem = (cb) => {
                                            steem.broadcast.comment(config.steem.wif, steempa, steempp, config.steem.account, commentLink, "", feedback + feedbackFooter, JSON.stringify({
                                                app: "onelovedtube/feedback"
                                            }),(err,sresult) => {
                                                if (err) return cb(err)
                                                cb(null,sresult)
                                            })
                                        }
                                    }
                                    
                                    asyncjs.parallel(commentOps,(errors,results) => {
                                        if (errors) console.log(errors)
                                        if (errors && errors.steem && errors.avalon) {
                                            video.addField("Info", "Something went wrong while broadcasting the feedback to the blockchains. Please manually verify that the feedback was posted. If not try again. If this still does not work: Don't panic. Contact <@366094647250124807>")
                                            return embed.edit({embed: video})
                                        }

                                        // Commented successfully on at least one blockchain
                                        if (errors && errors.avalon) {
                                            video.addField("Commented","[View on DTube](https://d.tube/#!/v/" + config.steem.account + "/" + commentLink + ")")
                                            video.addField("Info", "Something went wrong while broadcasting the feedback to Avalon blockchain. Please manually verify that the feedback was posted onto the blockchains.")
                                        } else
                                            video.addField("Commented","[View on DTube](https://d.tube/#!/v/" + config.avalon.account + "/" + commentLink + ")")
                                        
                                        if (errors && errors.steem) {
                                            video.addField("Info", "Something went wrong while broadcasting the feedback to Steem blockchain. Please manually verify that the feedback was posted onto the blockchains.")
                                        }

                                        helper.database.addFeedback(msg.author.id,feedback,authorInformation[0],authorInformation[1]).then(() => {
                                            embed.edit({embed: video})
                                        }).catch(() => {
                                            video.addField("Info", "Something went wrong while saving this feedback to the database. Please manually verify that the feedback was posted.")
                                            embed.edit({embed: video})
                                        })
                                    })
                                })
                            })
                        }
                    });
                }
            } else if (parts.length === 1) {
                const video = helper.DTubeLink(parts[0].trim());
                if (video !== undefined) {
                    let authorInformation = video.replace('/#!', '').replace('https://d.tube/v/','').split('/');
                    helper.database.feedBackExist(authorInformation[0], authorInformation[1]).then(exist => {
                        if (exist.length === 1) {
                            console.log(exist[0].discord)
                            let user = client.guilds.get(config.discord.curation.guild).members.get(exist[0].discord)
                            let video = new Discord.MessageEmbed();
                            video.setFooter("Powered by oneloved.tube Curation")
                                .setTimestamp()
                                .setTitle("Feedback for: @" + exist[0].author + '/' + exist[0].permlink)
                                .addField("View Video", "[Watch Video](https://d.tube/#!/v/" + exist[0].author + "/" + exist[0].permlink + ")", true)
                                .setDescription("This video already received feedback from <@" + user.user.id + '>')
                                .addField("Feedback", exist[0].message, true)
                                .setColor("LUMINOUS_VIVID_PINK");
                            msg.channel.send(video);
                        } else {
                            const emote = client.emojis.find(emoji => emoji.name === "onelovenew");
                            msg.reply(`This video has not received any feedback. ${emote}`)
                        }
                    });
                }
            }
        } else if (msg.content == '!mana') {
            asyncjs.parallel({
                mana: (cb) => {
                    helper.getVotingMana(config.mainAccount,(err,mana) => {
                        if (err) return cb(err)
                        cb(null,mana)
                    })
                },
                vp: async (cb) => {
                    try {
                        let vp = await helper.apis.getAvalonVP(config.avalon.account)
                        cb(null,vp)
                    } catch (e) { cb(e) }
                }
            },(errors,manas) => {
                if (errors) return msg.channel.send('An error occured. Please check the logs!')

                var active = 'Active'
                // Decide whethher if curation is active
                if (manas.mana < config.voting_threshold) {
                    active = 'Inactive'
                }

                if (manas.mana < config.voting_threshold) {
                    active += '\nTime to recharge mana to threshold of ' + config.voting_threshold + '%: ' + helper.getRechargeTime(manas.mana,config.voting_threshold)
                }

                if (manas.mana != 100) {
                    // Calculate full recharge time
                    active += '\nTime for a full recharge: ' + helper.getRechargeTime(manas.mana,100)
                } else {
                    // Mana is fully charged
                    active += '\nMana is fully charged.'
                }

                var embed = new Discord.MessageEmbed();
                embed.addField('Current voting mana for @' + config.mainAccount + ': ' + manas.mana + '%','Avalon VP available: ' + manas.vp + '\nCuration status: ' + active)
                msg.channel.send(embed)
            })
        } else if (helper.DTubeLink(msg.content)) {
            handleLink(msg)
        }
    }

    if (msg.content.startsWith('!faq') && config.mod_settings.enabled === true) {
        let faq = msg.content.replace('!faq', '').trim();
        if (faq.length > 0)
            if (faq === 'list') {
                let faqs = Object.keys(config.mod_settings.faq);
                let faq_embed = new Discord.MessageEmbed().setTimestamp().setFooter("Powered by oneloved.tube")
                    .setTitle("These are the help topics I know").setDescription(faqs.join(", "))
                    .addField("Usage:", "!faq *topic*")
                    .setThumbnail('https://image.flaticon.com/icons/png/512/258/258349.png');
                msg.channel.send({embed: faq_embed});
            } else {
                if (config.mod_settings.faq.hasOwnProperty(faq)) {
                    faq = config.mod_settings.faq[faq];
                    let faq_embed = new Discord.MessageEmbed().setTimestamp().setFooter("Powered by oneloved.tube")
                        .setTitle(faq[0]).setDescription(faq[1])
                        .setThumbnail('https://image.flaticon.com/icons/png/512/258/258349.png');
                    msg.channel.send({embed: faq_embed});
                }
            }
    }

});

client.on('messageReactionAdd', (reaction, user) => {
    helper.database.updateReactions(reaction.message.id, helper.countReaction(reaction.message))
});

client.on('messageReactionRemove', (reaction, user) => {
    helper.database.updateReactions(reaction.message.id, helper.countReaction(reaction.message))
});

client.on('error', (error) => console.log('Discord error: ' + error))

client.login(config.discord.token);

process.on('uncaughtException', function (error) {
    console.log('uncaughtExeption',error)
    process.exit(1)
});

process.on('unhandledRejection', function (error, p) {
    console.log('unhandledRejection',error)
    console.log(p);
    process.exit(1)
})