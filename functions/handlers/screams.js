const { db } = require("../util/admin");
const { isEmpty } = require("../util/validators");
exports.getAllScreams = (req, res) => {
	db.collection("screams")
		.orderBy("createdAt", "desc")
		.get()
		.then(q => {
			let screams = [];
			q.forEach(d => {
				screams.push({
					screamId: d.id,
					...d.data()
				});
			});
			return res.json(screams);
		})
		.catch(e => {
			console.error(e);
		});
};
exports.postSingleScream = (req, res) => {
	let errors = {};
	if (isEmpty(req.body.body)) errors.body = "Must not be empty";
	if (Object.keys(errors).length > 0) return res.status(400).json(errors);
	const newScream = {
		body: req.body.body,
		userHandle: req.user.handle,
		userImgUrl: req.user.imgUrl,
		createdAt: new Date().toISOString(),
		likeCount: 0,
		commentCount: 0
	};
	db.collection("screams")
		.add(newScream)
		.then(d => {
			const retscream = newScream;
			retscream.screamId = d.id;
			return res.json(retscream);
		})
		.catch(e => {
			console.error(e);
			return res.status(500).json({
				error: `Something went wrong: ${e.code}`
			});
		});
};
exports.getSingleScream = (req, res) => {
	let screamData = {};
	db.doc(`/screams/${req.params.screamId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "Scream not found" });
			}
			screamData = doc.data();
			screamData.screamId = doc.id;
			return db
				.collection("comments")
				.orderBy("createdAt", "desc")
				.where("screamId", "==", req.params.screamId)
				.get();
		})
		.then(data => {
			screamData.comments = [];
			data.forEach(doc => {
				screamData.comments.push(doc.data());
			});
			return res.json(screamData);
		})
		.catch(e => {
			console.error(e);
			return res.status(500).json(e);
		});
};
exports.commentScream = (req, res) => {
	if (isEmpty(req.body.body)) {
		return res.status(400).json({ comment: "Must be empty" });
	}
	const newCommment = {
		body: req.body.body.trim(),
		createdAt: new Date().toISOString(),
		screamId: req.params.screamId,
		userHandle: req.user.handle,
		userImgUrl: req.user.imgUrl
	};
	db.doc(`/screams/${req.params.screamId}`)
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "Cannot comment unknown Scream" });
			}
			return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
		})
		.then(() => {
			return db.collection("comments").add(newCommment);
		})
		.then(() => {
			return res.json(newCommment);
		})
		.catch(e => {
			console.error(e);
			return res.status(500).json({
				error: e.code
			});
		});
};
exports.likeScream = (req, res) => {
	const likeDoc = db
		.collection("likes")
		.where("userHandle", "==", req.user.handle)
		.where("screamId", "==", req.params.screamId)
		.limit(1);
	const screamDoc = db.doc(`/screams/${req.params.screamId}`);
	let screamData = {};
	screamDoc
		.get()
		.then(doc => {
			if (doc.exists) {
				screamData = doc.data();
				screamData.screamId = doc.id;
				return likeDoc.get();
			}
			return res.status(404).json({ error: "Scream not found" });
		})
		.then(data => {
			if (data.empty) {
				return db
					.collection("likes")
					.add({
						screamId: req.params.screamId,
						userHandle: req.user.handle
					})
					.then(() => {
						screamData.likeCount++;
						return screamDoc.update({ likeCount: screamData.likeCount });
					})
					.then(() => {
						return res.json(screamData);
					});
			}
			return res.status(400).json({ error: "Scream already liked" });
		})
		.catch(e => {
			console.error(e);
			return res.status(500).json({
				error: e.code
			});
		});
};
exports.unlikeScream = (req, res) => {
	const likeDoc = db
		.collection("likes")
		.where("userHandle", "==", req.user.handle)
		.where("screamId", "==", req.params.screamId)
		.limit(1);
	const screamDoc = db.doc(`/screams/${req.params.screamId}`);
	let screamData = {};
	screamDoc
		.get()
		.then(doc => {
			if (doc.exists) {
				screamData = doc.data();
				screamData.screamId = doc.id;
				return likeDoc.get();
			}
			return res.status(404).json({ error: "Scream not found" });
		})
		.then(data => {
			if (!data.empty) {
				return db
					.doc(`/likes/${data.docs[0].id}`)
					.delete()
					.then(() => {
						screamData.likeCount--;
						return screamDoc.update({ likeCount: screamData.likeCount });
					})
					.then(() => {
						return res.json(screamData);
					});
			}
			return res.status(400).json({ error: "Scream not liked" });
		})
		.catch(e => {
			console.error(e);
			return res.status(500).json({
				error: e.code
			});
		});
};
exports.deleteScream = (req, res) => {
	const document = db.doc(`/screams/${req.params.screamId}`);
	document
		.get()
		.then(doc => {
			if (!doc.exists) {
				return res.status(404).json({ error: "Scream not found" });
			}
			if (doc.data().userHandle !== req.user.handle) {
				return res.status(403).json({ error: "Unauthorized" });
			}
			return document.delete();
		})
		.then(() => {
			return res.json({ message: "Scream deleted successfully" });
		})
		.catch(e => {
			console.error(e);
			return res.status(500).json({
				error: e.code
			});
		});
};
