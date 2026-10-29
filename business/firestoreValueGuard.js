function removeUndefinedFirestoreValues(value){
  if(Array.isArray(value)){
    // Firestore does not accept undefined in arrays either. A null keeps the
    // historic position intact without inventing a value.
    for(let i=0;i<value.length;i++){
      if(value[i]===undefined)value[i]=null;
      else removeUndefinedFirestoreValues(value[i]);
    }
    return value;
  }
  if(value&&typeof value==='object'&&!(value instanceof Date)){
    for(const key of Object.keys(value)){
      if(value[key]===undefined)delete value[key];
      else removeUndefinedFirestoreValues(value[key]);
    }
  }
  return value;
}

module.exports={removeUndefinedFirestoreValues};
