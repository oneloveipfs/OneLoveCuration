const config = require('./config')
const hive = require('@hiveio/hive-js')
const steem = require('steem')
const blurt = require('@blurtfoundation/blurtjs')
const asyncjs = require('async')
const javalon = require('javalon')

let database = require('mysql').createConnection(config.database);

database.connect((err) => {
    if (err) throw err;
    console.log("Database connection etablished!");
    database.query("set session sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';", () => {
        console.log("Initialized Database")
    })
});

database.addMessage = async (id, author, permlink) => {
    return new Promise((resolve, reject) => {
        let sql = "INSERT INTO message (discord_id, author, permlink, posted) VALUES (?,?,?,?)";
        database.query(sql, [id, author, permlink, (new Date()).toISOString().slice(0, 19).replace('T', ' ')], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(true);
            }
        })
    })
};

database.getMessageSummary = async(days) => {
    return new Promise((resolve, reject) => {
        let sql = "select Count(id) as count, posted from message m WHERE m.posted > CURDATE() - INTERVAL ? DAY GROUP BY Day(m.posted);";
        database.query(sql,[days], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(result.reverse());
            }
        })
    })
};

database.getMessagesToVote = async () => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * FROM message WHERE voted = 0";
        database.query(sql, (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                resolve(result);
            }
        })
    })
}

database.getMessage = async (author, permlink) => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * FROM message where author = ? and permlink = ?";
        database.query(sql, [author, permlink], (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                if (result.length != 1)
                    resolve(null)
                else
                    resolve(result[0]);
            }
        })
    })
};

database.getMessages = async () => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * FROM message";
        database.query(sql, (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                resolve(result);
            }
        })
    })
};

database.countMessages = async () => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT Count(id) as count FROM message";
        database.query(sql, (err, result) => {
            if (err) {
                reject(err);
                console.log(err);
            } else {
                resolve(result);
            }
        })
    })
}

database.existMessage = async (author, permlink) => {
    let message = await database.getMessage(author, permlink);
    return new Promise((resolve, reject) => {
        if (!message) resolve(false);
        else resolve(true)
    })
};

database.updateReactions = async (id, reactions) => {
    return new Promise((resolve, reject) => {
        let sql = "UPDATE message SET ? WHERE voted = 0 and discord_id = " + id;
        database.query(sql, reactions, (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(true);
            }
        })
    })
};

database.feedBackExist = async (author, permlink) => {
    return new Promise((resolve, reject) => {
        let sql = "SELECT * from feedback where author = ? and permlink = ?";
        database.query(sql, [author, permlink], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(result);
            }
        })
    });
};

database.addFeedback = async (from, msg, author, permlink) => {
    let sql = "INSERT INTO feedback (discord,message,author,permlink) VALUES (?,?,?,?)";
    return new Promise((resolve, reject) => {
        database.query(sql, [from, msg, author, permlink], (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(true);
            }
        })
    })
}

// function uppercasefirst(str) {
//     return str.charAt(0).toUpperCase() + str.slice(1)
// }

const apis = {
    getAccount: (account,network) => {
        return new Promise((rs,rj) => apis.strToAPI(network).api.getAccounts([account],(e,r) => {
            if (e) return rj(e)
            rs(r)
        }))
    },
    getAvalonAccount: (account) => {
        return new Promise((rs,rj) => javalon.getAccount(account,(e,r) => {
            if (e) return rj(e)
            rs(r)
        }))
    },
    getAvalonContent: (name,link) => {
        return new Promise((rs,rj) => javalon.getContent(name,link,(e,r) => {
            if (e) return rj(e)
            rs(r)
        }))
    },
    getPower: (account,network) => {
        return new Promise(async (rs,rj) => {
            let sp = await apis.strToAPI(network).api.getAccountsAsync([account])
            let props = await apis.strToAPI(network).api.getDynamicGlobalPropertiesAsync()
            sp = sp[0]
            rs(apis.strToAPI(network).formatter.vestToSteem(parseFloat(sp.vesting_shares) + parseFloat(sp.received_vesting_shares) - parseFloat(sp.delegated_vesting_shares), props.total_vesting_shares, props['total_vesting_fund_'+network]))
        })
    },
    getVotingMana: (account,network) => {
        return new Promise(async (rs,rj) => {
            let acc = await apis.getAccount(account,network)
            let secondsago = (new Date - new Date(acc[0].last_vote_time + 'Z')) / 1000
            var mana = acc[0].voting_power + (10000 * secondsago / 432000)
            mana = Math.min(mana/100,100).toFixed(2)
            rs(mana)
        })
    },
    getAvalonVP: async (account) => {
        return new Promise(async (rs,rj) => {
            try {
                let acc = await apis.getAvalonAccount(account)
                rs(javalon.votingPower(acc))
            } catch (e) {
                return rj(e)
            }
        })
    },
    getManas: async (dtc,stm,hve) => {
        return new Promise(async (rs,rj) => {
            let result = {}
            if (dtc)
                result.dtc = await apis.getAvalonVP(dtc)
            if (stm)
                result.steem = await apis.getVotingMana(stm,'steem')
            if (hve)
                result.hive = await apis.getVotingMana(hve,'hive')
            rs(result)
        })
    },
    strToAPI: (network) => {
        switch (network) {
        case 'steem':
            return steem
        case 'hive':
            return hive
        case 'blurt':
            return blurt
        default:
            throw new Error('network does not exist')
        }
    }
}

const graphOps = {
    vote: (author,link,weight,network) => {
        return ['vote',{
            voter: config[network].account,
            author: author,
            permlink: link,
            weight: weight
        }]
    },
    reblog: (author,link) => {
        return ['custom_json',{
            required_auths: [],
            required_posting_auths: [config.resteem.account],
            id: 'follow',
            json: JSON.stringify(['reblog',{
                account: config.resteem.account,
                author: author,
                permlink: link
            }])
        }]
    }
}

function calculateVote(post,efficiency) {
    if (post.one_hundred >= 3)
        return 10000 * efficiency
    if (post.one_hundred == 2)
        return 8000 * efficiency

    let weight = 0

    // add up all the weights
    for (let i = 0; i < post.game_die; i++)
        weight += 100 * Math.floor(Math.random()*(12-2+1)+2);
    for (let i = 0; i < post.heart; i++)
        weight += 3500;
    for (let i = 0; i < post.one_hundred; i++)
        weight += 3500
    for (let i = 0; i < post.up; i++)
        weight += 2000;
    for (let i = 0; i < post.down; i++)
        weight -= 500;

    // if there is a disagrement, no vote
    if (weight > 0 && post.down > 0)
        return 0
    
    // maximum voting weight possible is 100%
    if (weight * efficiency > 10000) {
        return 10000   
    } else if (weight < 0) {
        return weight
    } else {
        return weight * efficiency
    }
}

function countReaction(message) {
    let reactions = {}
    for (const key in config.discord.curation.curation_emojis)
        reactions[key] =
            message.reactions.cache.get(config.discord.curation.curation_emojis[key]) ?
                message.reactions.cache.get(config.discord.curation.curation_emojis[key]).count
                : 0

    return reactions;
}

function getVoteValue(weight,voter,completion) {
    asyncjs.parallel({
        rewardPool: (cb) => {
            steem.api.getRewardFund('post',(err,res) => cb(err,res))
        },
        account: (cb) => {
            steem.api.getAccounts([voter],(err,res) => cb(err,res))
        },
        priceFeed: (cb) => {
            steem.api.getCurrentMedianHistoryPrice((err,res) => cb(err,res))
        }
    },(errors,results) => {
        if (errors) return completion(errors,null)
        let secondsago = (new Date - new Date(results.account[0].last_vote_time + 'Z')) / 1000
        var mana = results.account[0].voting_power + (10000 * secondsago / 432000)
        mana = Math.min(mana/100,100).toFixed(2)
        let feed = Number(results.priceFeed.base.slice(0,-4)) / Number(results.priceFeed.quote.slice(0,-6))
        let total_vests = Number(results.account[0].vesting_shares.slice(0,-6)) - Number(results.account[0].delegated_vesting_shares.slice(0,-6)) + Number(results.account[0].received_vesting_shares.slice(0,-6))
        let final_vest = total_vests * 1e6
        let power = (mana * weight / 10000) / 50
        let rshares = power * final_vest / 10000
        let estimate = rshares / Number(results.rewardPool.recent_claims) * Number(results.rewardPool.reward_balance.slice(0,-6)) * feed * 100
        completion(null,estimate)
    })
}

function generatePermlink() {
    let permlink = ""
    let possible = "abcdefghijklmnopqrstuvwxyz0123456789"

    for (let i = 0; i < 8; i++) {
        permlink += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return permlink
}

module.exports = {
    DTubeLink: (str) => {
        let words = str.split(' ')
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (word.startsWith('https://d.tube') || word.startsWith('https://dtube.techcoderx.com'))
                return word
        }
    },
    apis,
    calculateVote,
    countReaction,
    getMinutesSincePost: (posted) => {
        let diff = (new Date()).getTime() - posted.getTime();
        return (diff / 60000);
    },
    getVoteValue,
    generatePermlink,
    getRechargeTime: (currentMana, manaToGetRecharged) => {
        // Calculate recharge time to threshold mana
        var rechargeTimeMins = (manaToGetRecharged - currentMana) / (5/6)
        var rechargeTimeHours = 0
        while(rechargeTimeMins > 1) {
            rechargeTimeHours = rechargeTimeHours + 1
            rechargeTimeMins = rechargeTimeMins - 1
        }
        rechargeTimeMins = rechargeTimeMins * 60

        var rechargeTime;
        if (rechargeTimeHours > 0) {
            rechargeTime = rechargeTimeHours + ' hours and ' + Math.floor(rechargeTimeMins) + ' minutes'
        } else {
            rechargeTime = Math.floor(rechargeTimeMins) + ' minutes'
        }
        return rechargeTime
    },
    insufficientMana: (dtc, stm, hve) => {
        // Steem
        let secondsago, mana
        let result = {}
        secondsago = (new Date - new Date(stm[0].last_vote_time + 'Z')) / 1000
        mana = Math.min((stm[0].voting_power + (10000 * secondsago / 432000))/100,100).toFixed(2)
        if (mana < config.voting_threshold)
            result.steem = mana
    },
    vote: async (message, client, efficiency) => {
        return new Promise(async (resolve, reject) => {
            let post = await client.guilds.cache.get(config.discord.curation.guild)
                .channels.cache.get(config.discord.curation.channel)
                .messages.cache.get(message.discord_id)
            await database.updateReactions(post.id, countReaction(post))
            let weight = calculateVote(message, efficiency);
            if (weight === 0)
                return reject('Weight=0')

            // voting on avalon
            let currentAvalonVP = await apis.getAvalonVP(config.avalon.account)
            let vpToSpend = Math.floor((weight / 10000) * (config.avalon.vpMultiplier / 100) * currentAvalonVP)
            if (vpToSpend < 1) vpToSpend = 1

            console.log('voting', message.author + '/' + message.permlink, weight, vpToSpend)

            var newTx = {
                type: javalon.TransactionType.VOTE,
                data: {
                    author: message.author,
                    link: message.permlink,
                    vt: vpToSpend,
                    tag: config.avalon.tag
                }
            }
            
            newTx = javalon.sign(config.avalon.wif, config.avalon.account, newTx)

            javalon.sendRawTransaction(newTx, function(err, res) {
                if (!err) {
                    let sql = "UPDATE message SET voted = 1, vote_weight = ?, vp_spent = ? WHERE author = ? and permlink = ?";
                    database.query(sql, [weight, vpToSpend, message.author, message.permlink], (err, result) => {
                        console.log("Voted with " + (weight / 100) + "% for @" + message.author + '/' + message.permlink);
                        resolve(result);
                    })
                } else {
                    return reject('Avalon vote error' + JSON.stringify(err))
                }
            })

            // Graphene votes
            let content = await apis.getAvalonContent(message.author, message.permlink)
            let voted = []
            if (content.json && content.json.refs) for (let i = 0; i < content.json.refs.length; i++) {
                let ref = content.json.refs[i].split('/')
                if ((ref[0] == 'steem' && !voted.includes('steem')) ||
                    (ref[0] == 'hive' && !voted.includes('hive')) ||
                    (ref[0] == 'blurt' && !voted.includes('blurt'))) {
                    voted.push(ref[0])
                    let ops = [graphOps.vote(ref[1],ref[2],weight,ref[0])]
                    let wifs = [config.steem.wif]
                    
                    if (weight >= config.resteem.threshold) {
                        // Resteem post if voting weight is high enough
                        ops.push(graphOps.reblog(ref[1],ref[2]))
                    
                        if (config.resteem.wif !== config[ref[0]].wif)
                            wifs.push(config.resteem.wif)
                    }
                    
                    apis.strToAPI(ref[0]).broadcast.send({ extensions: [], operations: ops },wifs,(err) => {
                        if (err)
                            console.log(ref[0] + " error: " + err);
                    })
                }
            }
        })
    },
    database
};
