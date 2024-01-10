---
title: "Effective Java - 아이템 7: 다 쓴 객체 참조를 해제하라"
categories:
  - Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

메모리 누수가 있는 프로그램을 오래 실행하다 보면 점차 가비지 컬렉션 활동과 메모리 사용량이 늘어나 결국 성능이 저하된다.

```java
// 메모리 누수가 일어나는 코드
public class Stack {
    private Object[] elements;
    private int size = 0;
    private static final int DEFAULT_INITIAL_CAPACITY = 16;
    
    public Stack() {
        elements = new Object[DEFAULT_INITIAL_CAPACITY];
    }

    public void push(Object e) {
        ensureCapacity();
        elements[size++] = e;
    }
    
    public Object pop() {
        if (size == 0) {
            throw new EmptyStackeException();
        }
        return elements[--size];
    }

    /**
     * 원소를 위한 공간을 적어도 하나 이상 확보한다.
     * 배열 크리글 늘려야 할 때마다 대략 두 배씩 늘린다.
     */
    private void ensureCapacity() {
        if (elements.length == size) {
            elements = Arrays.copyOf(elements, 2 * size + 1);
        }
    }
}
```

이 코드에서는 스택이 커졌다가 줄어들었을 때 스택에서 꺼내진 객체들(더 이상 사용하지 않는 객체들)을 가비지 컬렉터가 회수하지 않는다.
이 스택이 그 객체들의 **다 쓴 참조(obsolete reference) 즉, 다시 쓰지 않을 참조**를 여전히 가지고 있기 때문이다.<br>
이 코드에서 다 쓴 참조는 elements 배열의 활성영역(인덱스가 size보다 작은 원소들) 밖의 참조들이 해당한다.<br>
객체 참조 하나를 살려두면 가비지 컬렉터는 **그 객체뿐 아니라 이 객체가 참조하는 다른 객체** 또한 회수해가지 못한다.

### 해결 방법
**해당 참조를 다 썼을 때 null 처리(참조 해제)하면 된다.**

```java
// 제대로 구현한 pop 메서드
public Object pop() {
    if (size == 0) {
        throw new EmptyStackException();
    }
    Object result = elements[--size];
    elements[size] = null; // 다 쓴 참조 해제
    return result;
}
```

다 쓴 참조를 null 처리하면 메모리 누수 이외에 다른 이점도 따라오는데,<br> 
null 처리한 참조를 실수로 사용하려 하면`NullPointerException`을 던지며 종료된다.<br> 
미리 null 처리를 하지 않았다면 아무 내색 없이 무언가 잘못된 일을 수행할 것이다.<br>
**객체 참조를 null 처리하는 일은 예외적인 경우여야 한다.**

### 다 쓴 참조를 해제하는 가장 좋은 방법
**그 참조를 담은 변수를 유효 범위(scope) 밖으로 밀어내는 것이다.**
변수의 범위를 최소가 되게 정의했다면 자연스럽게 이뤄진다.

### null 처리(참조해제)는 언제 해야 할까?
비활성 영역의 객체가 더 이상 쓸모없다는 건 프로그래머만 아는 사실이기 때문에 비활성 영역이 되는 순간 null 처리해서
해당 객체를 더는 쓰지 않을 것임을 가비지 컬렉터에 알려야 한다.

**일반적으로 자기 메모리를 직접 관리하는 클래스라면 프로그래머는 항시 메모리 누수에 주의해야 한다.**

### 캐시(cache) 또한 메모리 누수를 일으키는 주범이다
객체 참조를 캐시에 넣고, 그 객체를 다 쓴 뒤로도 한참 놔두는 일이 자주 생긴다.<br>
캐시 외부에서 키를 참조하는 동안만 엔트리가 살아있는 캐시가 필요한 상황이라면 `WeakHashMap`을 사용해 캐시를 만들어라.<br> 
다 쓴 엔트리는 그 즉시 자동으로 제거될 것이다.<br> 
단, `WeakHashMap`은 이런 상황에서만 유용하다.

### 리스너(listener) 혹은 콜백(callback) 또한 메모리 누수의 주범이다
클라이언트가 콜백을 등록만 하고 명확히 해지하지 않는다면, 계속 쌓인다.<br> 
이럴 때 콜백을 약한 참조(weak reference)로 저장하면 가비지 컬렉터가 즉시 수거해간다.

### Reference 우선순위
1. Strong - 절대 못건드림
2. Soft
3. Weak - 제일 먼저 없어짐
4. Phantom

### 핵심 정리
자기 메모리를 직접 관리하는 클래스라면 항시 메모리 누수에 주의해야 한다.<br>
다 쓴 참조를 해제하는 가장 좋은 방법은 변수의 범위를 최소가 되게 정의하여,<br>
그 참조를 담은 변수를 유효 범위 밖으로 밀어내는 것이다.
