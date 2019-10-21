const { admin, db } = require("../util/admin");
const config = require("../util/config");
const firebase = require("firebase");
const {
	validateSignupData,
	validateLoginData,
	reduceUserDetails
} = require("../util/validators");
firebase.initializeApp(config);
exports.signup = (req, res) => {
	const newUser = {
		email: req.body.email,
		password: req.body.password,
		confirmPassword: req.body.confirmPassword,
		handle: req.body.handle
	};
	const { valid, errors } = validateSignupData(newUser);
	if (!valid) return res.status(400).json(errors);
	const noImg = "2.png";
	//Logic New User
	let token, userId;
	db.doc(`/users/${newUser.handle}`)
		.get()
		.then(d => {
			if (d.exists) {
				return res.status(400).json({
					handle: "This handle is already taken"
				});
			} else {
				return firebase
					.auth()
					.createUserWithEmailAndPassword(newUser.email, newUser.password);
			}
		})
		.then(d => {
			userId = d.user.uid;
			return d.user.getIdToken();
		})
		.then(t => {
			token = t;
			const userCredentials = {
				handle: newUser.handle,
				email: newUser.email,
				createdAt: new Date().toISOString(),
				imgUrl: `https://firebasestorage.googleapis.com/v0/b/${
					config.storageBucket
				}/o/${noImg}?alt=media`,
				userId
			};
			return db.doc(`/users/${newUser.handle}`).set(userCredentials);
		})
		.then(() => {
			return res.status(201).json({ token });
		})
		.catch(e => {
			console.error(e);
			if (e.code === "auth/email-already-in-use") {
				return res.status(400).json({ email: "This email is already taken" });
			} else if (e.code === "auth/weak-password") {
				return res
					.status(400)
					.json({ password: "Too weak, use a stronger password" });
			}
			return res
				.status(500)
				.json({ general: "Something went wrong, please try again" });
		});
};
exports.login = (req, res) => {
	const user = {
		email: req.body.email,
		password: req.body.password
	};
	const { valid, errors } = validateLoginData(user);
	if (!valid) return res.status(400).json(errors);
	//Logic
	firebase
		.auth()
		.signInWithEmailAndPassword(user.email, user.password)
		.then(d => {
			return d.user.getIdToken();
		})
		.then(token => {
			return res.status(201).json({ token });
		})
		.catch(e => {
			console.error(e);
			return res
				.status(403)
				.json({ general: "Wrong credentials, please try again" });
		});
};
//upload profile image
exports.uploadImage = (req, res) => {
	const BusBoy = require("busboy");
	const path = require("path");
	const os = require("os");
	const fs = require("fs");

	const busboy = new BusBoy({ headers: req.headers });
	let imgFileName;
	let imgToUpload = {};

	busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
		if (!mimetype.match("image.*")) {
			return res.status(400).json({ error: "Wrong file type submitted" });
		}
		const imgExt = filename.split(".")[filename.split(".").length - 1];
		imgFileName = `${Math.round(Math.random() * 10000000000)}.${imgExt}`;
		const filePath = path.join(os.tmpdir(), imgFileName);
		imgToUpload = { filePath, mimetype };
		file.pipe(fs.createWriteStream(filePath));
	});
	busboy.on("finish", () => {
		admin
			.storage()
			.bucket()
			.upload(imgToUpload.filePath, {
				resumable: false,
				metadata: {
					metadata: {
						contentType: imgToUpload.mimetype
					}
				}
			})
			.then(() => {
				const imgUrl = `https://firebasestorage.googleapis.com/v0/b/${
					config.storageBucket
				}/o/${imgFileName}?alt=media`;
				return db.doc(`/users/${req.user.handle}`).update({ imgUrl });
			})
			.then(() => {
				return res.json({ message: "Image Uploaded Successfully" });
			})
			.catch(err => {
				console.error(err);
				return res.status(500).json({ error: err.code });
			});
	});
	busboy.end(req.rawBody);
};
exports.addUserDetails = (req, res) => {
	let userDetails = reduceUserDetails(req.body);
	db.doc(`/users/${req.user.handle}`)
		.update(userDetails)
		.then(() => {
			return res.json({ message: "User Details Updated Successfully" });
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};
//get own user details
exports.getAuthenticatedUser = (req, res) => {
	let userData = {};
	db.doc(`/users/${req.user.handle}`)
		.get()
		.then(doc => {
			if (doc.exists) {
				userData.credentials = doc.data();
				return db
					.collection("likes")
					.where("userHandle", "==", req.user.handle)
					.get();
			}
		})
		.then(data => {
			userData.likes = [];
			data.forEach(doc => {
				userData.likes.push(doc.data());
			});
			return db
				.collection("notifications")
				.orderBy("createdAt", "desc")
				.where("recipient", "==", req.user.handle)
				.get();
		})
		.then(data => {
			userData.notifications = [];
			data.forEach(doc => {
				userData.notifications.push({ ...doc.data(), notificationId: doc.id });
			});
			return res.json(userData);
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};
//get any user details
exports.getUserDetails = (req, res) => {
	let userData = {};
	db.doc(`/users/${req.params.handle}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "User not found" });
			}
			userData.user = doc.data();
			return db
				.collection("screams")
				.orderBy("createdAt", "desc")
				.where("userHandle", "==", req.params.handle)
				.get();
		})
		.then(data => {
			userData.screams = [];
			data.forEach(doc => {
				userData.screams.push({ ...doc.data(), screamId: doc.id });
			});
			return res.json(userData);
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};
exports.markNotificationRead = (req, res) => {
	const batch = db.batch();
	req.body.forEach(notificationId => {
		const notification = db.doc(`/notifications/${notificationId}`);
		batch.update(notification, { read: true });
	});
	batch
		.commit()
		.then(() => {
			return res.json({ message: "Notification marked as read" });
		})
		.catch(err => {
			console.error(err);
			return res.status(500).json({ error: err.code });
		});
};
