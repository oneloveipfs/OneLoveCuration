const config = require('./config');
const steem = require('steem');
const asyncjs = require('async')
const javalon = require('javalon');

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
    });
};

function calculateVote(post,author) {
    if (post.one_hundred >= 3)
        return 10000
    if (post.one_hundred == 2)
        return 8000

    let weight = 0

    // add up all the weights
    for (let i = 0; i < post.game_die; i++)
        weight += 100 * Math.floor(Math.random()*(12-2+1)+2);
    for (let i = 0; i < post.heart; i++)
        weight += 3500;
    for (let i = 0; i < post.up; i++)
        weight += 2000;
    for (let i = 0; i < post.down; i++)
        weight -= 500;

    // if there is a disagrement, no vote
    if (weight > 0 && post.down > 0)
        return 0

    // Blacklisted users are not eligible for upvotes
    if (config.blacklistedUsers.includes(author) && weight > 0)
        return 0
    
    // maximum voting weight possible is 100%
    if (weight > 10000) {
        return 10000   
    } else {
        return weight
    }
}

function countReaction(message) {
    let reactions = {}
    for (const key in config.discord.curation.curation_emojis)
        reactions[key] =
            message.reactions.get(config.discord.curation.curation_emojis[key]) ?
                message.reactions.get(config.discord.curation.curation_emojis[key]).count
                : 0

    return reactions;
}

function getVotingMana(account,cb) {
    steem.api.getAccounts(account,(err,res) => {
        if (err) {
            cb(err)
            return
        }
        let secondsago = (new Date - new Date(res[0].last_vote_time + 'Z')) / 1000
        var mana = res[0].voting_power + (10000 * secondsago / 432000)
        mana = Math.min(mana/100,100).toFixed(2)
        cb(null,mana)
    })
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

function getAvalonVP(account,cb) {
    javalon.getAccount(account,(err,res) => {
        if (err) return cb(err)
        cb(null,javalon.votingPower(res))
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
            if (word.startsWith('https://d.tube') || word.startsWith('https://dtube.network'))
                return word
        }

    },
    calculateVote,
    countReaction,
    getMinutesSincePost: (posted) => {
        let diff = (new Date()).getTime() - posted.getTime();
        return (diff / 60000);
    },
    getVotingMana,
    getVoteValue,
    getAvalonVP,
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
    vote: async (message, client, author) => {
        return new Promise((resolve, reject) => {
            client
                .guilds
                .get(config.discord.curation.guild)
                .channels
                .get(config.discord.curation.channel)
                .fetchMessage(message.discord_id).then(post => {
                database.updateReactions(post.id, countReaction(post)).then(async () => {
                    let weight = calculateVote(message, author);
                    if (weight === 0) {
                        reject('Weight=0')
                    } else {
                        console.log('voting', message.author + '/' + message.permlink, weight);

                        // voting on avalon
                        let avalonVPPromise = new Promise((resolve,reject) => {
                            getAvalonVP(config.avalon.account,(err,vp) => {
                                if (err) return reject(err)
                                resolve(vp)
                            })
                        })

                        let currentAvalonVP = await avalonVPPromise
                        let vpToSpend = Math.floor((weight / 10000) * (config.avalon.vpMultiplier / 100) * currentAvalonVP)

                        // VP spent must be at least 1
                        if (vpToSpend < 1) vpToSpend = 1

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
                                return reject('Avalon vote error:')
                            }
                        })

                        javalon.getContent(message.author, message.permlink, function(err, res) {
                            if (err) return reject(err)
                            if (res.json && res.json.refs) {
                                for (let i = 0; i < res.json.refs.length; i++) {
                                    var ref = res.json.refs[i].split('/')
                                    if (ref[0] == 'steem') {
                                        // voting on steem !

                                        let ops = [
                                            ['vote',{
                                                voter: config.steem.account,
                                                author: ref[1], //author
                                                permlink: ref[2], //permlink
                                                weight: weight
                                            }]
                                        ]
                                        
                                        var wifs = [config.steem.wif]
                                        
                                        if (weight >= config.resteem.threshold) {
                                            // Resteem post if voting weight is high enough
                                            ops.push(['custom_json',{
                                                required_auths: [],
                                                required_posting_auths: [config.resteem.account],
                                                id: 'follow',
                                                json: JSON.stringify(['reblog',{
                                                    account: config.resteem.account,
                                                    author: ref[1],
                                                    permlink: ref[2]
                                                }])
                                            }])
                                        
                                            if (config.resteem.wif !== config.steem.wif)
                                                wifs.push(config.resteem.wif)
                                        }
                                        
                                        steem.broadcast.send({
                                            extensions: [],
                                            operations: ops
                                        },wifs,(err,result_bc) => {
                                            if (err) {
                                                reject("Steem error: " + err);
                                            }
                                        })

                                        // making sure its only spending one vote :)
                                        break;
                                    }
                                }
                            }
                        })
                    }
                })
            });
        })
    },
    database
};
