---
title: "자료구조 contains(), add()"
categories:
  - Java
tags:
  - Data Structure
  - Solution
toc: false
toc_sticky: true
toc_label: ""
toc_icon: ""
---

`isValidDuplicated` 메서드는 친구관계를 나타내는 `friends` 리스트에서
[[”json”, “john”], [”john”, “json”]] 과 같이 중복되는 친구관계가 담겨있는지 확인하는 메서드이다.
<br>
```java
// 개선 전
// friend는 [["json", "john"], ["john", "mike"]...] 이런 데이터가 담긴 List이다.
private static boolean isValidDuplicated(List<List<String>> friends) {
    Set<List<String>> uniqueFriends = new HashSet<>();
    for (List<String> friendPair : friends) {
        if (uniqueFriends.contains(friendPair) || uniqueFriends.contains(reverseFriendPair(friendPair)) {
            return true;
        }
        uniqueFriends.add(friendPair);
    }
    return false;
}

private static List<String> reverseFriendPair(List<String> pair) {
    List<String> reversedPair = new ArrayList<>(pair);
    Collections.reverse(reversedPair);
    return reversedPair;
}
```

처음에는 `friends`의 원소 `friendPair`를 순회하면서 `Set<List<String>> uniqueFriends`에 담아서 중복을 제거하고 `friendPair`와, `friendPair`의 정렬을 반대로 뒤집는 메서드인 `reversedFriendPair()`의 반환값이 이미 `uniqueFriend`에 포함되어있는지 확인한다.

만약 포함되어있다면 중복되어있는 `List` 이므로 `true`를 반환하고, 없다면 `uniqueFriends`에 추가하여 순회를 마칠 때 까지 `true`를 반환하지 않으면 `false`를 반환한다.

여기서 문제는 `contains()` 메서드를 사용하였기 때문에 `uniqueFriends`에 `friendPair`, `reversedFriendPair`가 포함되어있는지 내부적으로 두 번 `uniqueFriends`를 순회하면서 확인하기 때문에 `uniqueFriends` 시간복잡도 O(N^2)를 가지며, Set의 크기가 커질수록 성능이 떨어지는 문제가 발생한다.

더 효율적으로 중복을 확인하기 위해서 한 번의 스캔으로 해결해야 하는데, 그래서 `contains()` 대신 `add()` 를 사용하였다.

```java
// 개선 후
private static boolean isValidDuplicated(List<List<String>> friends) {
    Set<List<String>> uniqueFriends = new HashSet<>();
    for (List<String> friendPair : friends) {
        if (!uniqueFriends.add(friendPair) && !uniqueFriends.add(reverseFriendPair(friendPair))) {
            return true;
        }
    }
    return false;
}

private static List<String> reverseFriendPair(List<String> pair) {
    List<String> reversedPair = new ArrayList<>(pair);
    Collections.reverse(reversedPair);
    return reversedPair;
}
```

Java의 자료구에서`add()` 는 일반적으로 `boolean`을 반환한다. 컬렉션 인터페이스를 구현한 `List`, `Set` 의 경우 요소를 저장하는데 성공하면 `true` 를 반환한다. `List`의 경우 중복을 허용하기 때문에 언제나 `true`를 반환하지만, `Set`의 경우 중복을 허용하지 않기 때문에 저장하려는 요소가 내부에 존재하는 경우 `false`를 반환한다.

`if (!uniqueFriends.add(friendPair) && !uniqueFriends.add(reverseFriendPair(friendPair)))` 로 변경함으로써 `uniqueFriends`의 모든 요소들을 찾아보는 일과 중복이 없으면 `add`하는 두가지 일을 한 번에 처리하고, 두 번 순회하여 생긴 비효율도 개선할 수 있었다.
