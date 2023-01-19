const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

app.post("/register/", async (request, response) => {
  console.log(request.body);
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
        INSERT INTO 
        user (username, name, password, gender) 
        VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send("User created successfully");
    }
  } else {
    response.status = 400;
    response.send("User already exists");
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//feeds
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
  const getUserId = await db.get(userIdQuery);
  const { user_id } = getUserId;

  const tweetFeedsQuery = `SELECT user.username, tweet.tweet, tweet.date_time AS dateTime 
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE user.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id = ${user_id})
  ORDER BY tweet.date_time DESC 
  LIMIT 4;`;

  const getTweetFeeds = await db.all(tweetFeedsQuery);
  response.send(getTweetFeeds);
});

//following
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
  const getUserId = await db.get(userIdQuery);
  const { user_id } = getUserId;

  const userFollowingQuery = `SELECT name FROM user WHERE user_id IN 
 (SELECT following_user_id FROM follower WHERE follower_user_id = ${user_id});`;

  const getUserFollowing = await db.all(userFollowingQuery);
  response.send(getUserFollowing);
});

//follower
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
  const getUserId = await db.get(userIdQuery);
  const { user_id } = getUserId;

  const userFollowerQuery = `SELECT name FROM user WHERE user_id IN 
 (SELECT follower_user_id FROM follower WHERE following_user_id = ${user_id});`;

  const getUserFollowers = await db.all(userFollowerQuery);
  response.send(getUserFollowers);
});

//tweets on tweet ID
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
  const getUserId = await db.get(userIdQuery);
  const { user_id } = getUserId;

  //tweet_ids of following user_ids
  const userFollowingQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (SELECT 
 following_user_id FROM follower 
  WHERE follower_user_id = ${user_id});`;

  const getUserFollowing = await db.all(userFollowingQuery);

  const followingUserIds = getUserFollowing.map(
    (eachUser) => eachUser.tweet_id
  );
  console.log(followingUserIds);

  console.log(followingUserIds.includes(Number(tweetId)));

  if (followingUserIds.includes(Number(tweetId))) {
    const tweetQuery = `SELECT tweet.tweet, COUNT(DISTINCT like.user_id) AS likes,
    COUNT(DISTINCT reply.reply) AS replies, tweet.date_time AS dateTime FROM 
    (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS T 
    INNER JOIN reply ON T.tweet_id = reply.tweet_id WHERE tweet.tweet_id = ${tweetId};`;

    const getTweet = await db.get(tweetQuery);
    response.send(getTweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//tweet likes
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
    const getUserId = await db.get(userIdQuery);
    const { user_id } = getUserId;

    //tweet_ids of following user_ids
    const userFollowingQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (SELECT 
 following_user_id FROM follower 
  WHERE follower_user_id = ${user_id});`;

    const getUserFollowing = await db.all(userFollowingQuery);

    const followingUserIds = getUserFollowing.map(
      (eachUser) => eachUser.tweet_id
    );
    //console.log(followingUserIds);

    //console.log(followingUserIds.includes(Number(tweetId)));

    if (followingUserIds.includes(Number(tweetId))) {
      const tweetLikesQuery = `SELECT username FROM user WHERE 
      user_id IN (SELECT user_id FROM like WHERE tweet_id = ${tweetId});`;

      const getTweetLikes = await db.all(tweetLikesQuery);
      const likeArray = getTweetLikes.map((eachLike) => eachLike.username);
      // console.log(likeArray);
      const likeObject = { likes: likeArray };
      // console.log(likeObject);
      response.send(likeObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// replys
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
    const getUserId = await db.get(userIdQuery);
    const { user_id } = getUserId;

    //tweet_ids of following user_ids
    const userFollowingQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (SELECT 
 following_user_id FROM follower 
  WHERE follower_user_id = ${user_id});`;

    const getUserFollowing = await db.all(userFollowingQuery);

    const followingUserIds = getUserFollowing.map(
      (eachUser) => eachUser.tweet_id
    );
    //console.log(followingUserIds);

    //console.log(followingUserIds.includes(Number(tweetId)));

    if (followingUserIds.includes(Number(tweetId))) {
      const tweetReplyQuery = `SELECT user.name, reply.reply FROM 
      user NATURAL JOIN reply WHERE tweet_id = ${tweetId};`;

      const getTweetReplies = await db.all(tweetReplyQuery);

      const replyObject = { replies: getTweetReplies };

      response.send(replyObject);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// user tweets
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
  const getUserId = await db.get(userIdQuery);
  const { user_id } = getUserId;

  //   const userTweets = `SELECT tweet_id FROM tweet WHERE user_id = ${user_id};`;
  //   const userTweetsIds = await db.all(userTweets);
  //   console.log(userTweetsIds);

  const userTweetQuery = `SELECT tweet.tweet, COUNT(DISTINCT like.user_id) AS likes,
      COUNT(DISTINCT reply.reply) AS replies, tweet.date_time AS dateTime FROM 
      (tweet INNER JOIN like ON tweet.user_id = like.user_id) as T INNER JOIN 
      reply ON T.user_id = reply.user_id WHERE tweet.user_id = ${user_id}`;

  const getUserTweets = await db.all(userTweetQuery);

  response.send(getUserTweets);
});

//post tweet
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const tweetQuery = `INSERT INTO tweet(tweet) VALUES("${tweet}");`;
  const dbResponse = await db.run(tweetQuery);
  const tweet_id = dbResponse.lastID;
  response.send("Created a Tweet");
});

// delete tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id FROM user WHERE username = "${username}";`;
    const getUserId = await db.get(userIdQuery);
    const { user_id } = getUserId;
    const userTweets = `SELECT tweet_id FROM tweet WHERE user_id = ${user_id};`;
    const getUserTweets = await db.all(userTweets);
    const userTweetsArray = getUserTweets.map(
      (eachTweet) => eachTweet.tweet_id
    );
    console.log(userTweetsArray);
    if (userTweetsArray.includes(Number(tweetId))) {
      const tweetDeleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
      await db.run(tweetDeleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
